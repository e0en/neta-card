import React, { useState, useEffect } from 'react';

interface SushiCard {
  한자: string;
  가나: string;
  한국어명: string;
  '제철 시작': string;
  '제철 끝': string;
  '고급 여부': string;
}

interface CardStats {
  correctCount: number;
  totalCount: number;
  lastStudied: Date | null;
  weight: number;
  interval: number;
  easeFactor: number;
  dueDate: Date;
  averageResponseTime: number;
  fastAnswers: number;
}

interface StudyRecord {
  timestamp: string;
  cardIndex: number;
  kanji: string;
  kana: string;
  korean: string;
  isCorrect: boolean;
  reviewNumber: number;
  responseTime: number;
}

const SushiFlashcards = () => {
  const [sushiData, setSushiData] = useState<SushiCard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [studyHistory, setStudyHistory] = useState<StudyRecord[]>([]);
  const [cardStats, setCardStats] = useState<{ [key: number]: CardStats }>({});
  const [weightedDeck, setWeightedDeck] = useState<number[]>([]);
  const [cardShownTime, setCardShownTime] = useState<Date | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(0);
  const [showStatsPage, setShowStatsPage] = useState(false);
  const [statsSortOrder, setStatsSortOrder] = useState<'asc' | 'desc'>('desc');
  const [seasonalSortEnabled, setSeasonalSortEnabled] = useState(false);

  // localStorage keys
  const STORAGE_KEYS = {
    SUSHI_DATA: 'sushi-flashcard-data',
    CARD_STATS: 'sushi-flashcard-stats',
    STUDY_HISTORY: 'sushi-flashcard-history',
    SCORE: 'sushi-flashcard-score'
  };

  // localStorage utility functions
  const saveToLocalStorage = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  };

  const loadFromLocalStorage = (key: string) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
      return null;
    }
  };

  useEffect(() => {
    loadSushiData();
  }, []);

  useEffect(() => {
    if (sushiData.length > 0) {
      updateWeightedDeck();
    }
  }, [sushiData, cardStats]);

  // Save data to localStorage when it changes
  useEffect(() => {
    if (sushiData.length > 0) {
      saveToLocalStorage(STORAGE_KEYS.SUSHI_DATA, sushiData);
    }
  }, [sushiData]);

  useEffect(() => {
    if (Object.keys(cardStats).length > 0) {
      saveToLocalStorage(STORAGE_KEYS.CARD_STATS, cardStats);
    }
  }, [cardStats]);

  useEffect(() => {
    if (studyHistory.length > 0) {
      saveToLocalStorage(STORAGE_KEYS.STUDY_HISTORY, studyHistory);
    }
  }, [studyHistory]);

  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.SCORE, score);
  }, [score]);

  const loadSushiData = async () => {
    try {
      // First try to load from localStorage
      const savedData = loadFromLocalStorage(STORAGE_KEYS.SUSHI_DATA);
      const savedStats = loadFromLocalStorage(STORAGE_KEYS.CARD_STATS);
      const savedHistory = loadFromLocalStorage(STORAGE_KEYS.STUDY_HISTORY);
      const savedScore = loadFromLocalStorage(STORAGE_KEYS.SCORE);

      if (savedData && savedData.length > 0) {
        // Load from localStorage
        console.log('Loading data from localStorage');
        setSushiData(savedData);
        
        if (savedStats) {
          // Restore dates from strings
          const restoredStats = Object.keys(savedStats).reduce((acc, key) => {
            const stats = savedStats[key];
            acc[key] = {
              ...stats,
              lastStudied: stats.lastStudied ? new Date(stats.lastStudied) : null,
              dueDate: new Date(stats.dueDate)
            };
            return acc;
          }, {});
          setCardStats(restoredStats);
        } else {
          initializeCardStats(savedData);
        }
        
        if (savedHistory) {
          setStudyHistory(savedHistory);
        }
        
        if (savedScore) {
          setScore(savedScore);
        }
        
        return;
      }

      // Fallback to CSV loading
      console.log('Loading data from CSV');
      const response = await fetch('/sushi_netalist_full.csv');
      const csvData = await response.text();
      
      const Papa = await import('papaparse');
      
      const parsed = Papa.parse(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
      });

      const cardData = parsed.data as SushiCard[];
      setSushiData(cardData);
      initializeCardStats(cardData);
      
      // Save to localStorage for offline use
      saveToLocalStorage(STORAGE_KEYS.SUSHI_DATA, cardData);
    } catch (error) {
      console.error('데이터 로딩 오류:', error);
      
      // Last resort: try to load from localStorage even if it failed initially
      const savedData = loadFromLocalStorage(STORAGE_KEYS.SUSHI_DATA);
      if (savedData && savedData.length > 0) {
        console.log('Using cached data after network failure');
        setSushiData(savedData);
        initializeCardStats(savedData);
      } else {
        alert('데이터를 로딩할 수 없습니다. 인터넷 연결을 확인하고 새로고침해주세요.');
      }
    }
  };

  const initializeCardStats = (data: SushiCard[]) => {
    const stats: { [key: number]: CardStats } = {};
    data.forEach((card, index) => {
      stats[index] = {
        correctCount: 0,
        totalCount: 0,
        lastStudied: null,
        weight: 1.0,
        interval: 30, // 30초부터 시작
        easeFactor: 2.5,
        dueDate: new Date(),
        averageResponseTime: 0,
        fastAnswers: 0
      };
    });
    setCardStats(stats);
  };

  const updateWeightedDeck = () => {
    if (sushiData.length === 0 || Object.keys(cardStats).length === 0) return;
    
    const now = new Date();
    const deck: number[] = [];
    
    sushiData.forEach((card, index) => {
      const stats = cardStats[index];
      if (!stats) return;
      
      // Calculate learning priority score
      const baseUrgency = 1 / (stats.totalCount + 1);
      
      const accuracy = stats.totalCount > 0 ? stats.correctCount / stats.totalCount : 0;
      const difficultyFactor = Math.pow(1 - accuracy, 2) + 0.1;
      
      let recencyFactor;
      if (stats.dueDate <= now) {
        // Card is due or overdue
        const secondsOverdue = Math.max(0, (now.getTime() - stats.dueDate.getTime()) / 1000);
        recencyFactor = Math.min(3.0, 1.0 + secondsOverdue / 60);
      } else {
        // Card is not yet due
        recencyFactor = 0.1;
      }
      
      const priorityScore = baseUrgency * difficultyFactor * recencyFactor;
      
      // Convert priority to weight (scale up and ensure minimum of 1)
      const weight = Math.max(1, Math.round(priorityScore * 50));
      
      // Add cards to deck based on their weight
      for (let i = 0; i < weight; i++) {
        deck.push(index);
      }
    });
    
    // 카드가 없으면 전체 덱 사용
    if (deck.length === 0) {
      sushiData.forEach((_, index) => deck.push(index));
    }
    
    setWeightedDeck(deck);
  };

  const calculateNextReview = (cardIndex: number, isCorrect: boolean, responseTimeSeconds = 0) => {
    const stats = cardStats[cardIndex];
    const now = new Date();
    
    let newInterval = stats.interval;
    let newEaseFactor = stats.easeFactor;
    let newWeight = stats.weight;
    
    // 반응 시간 카테고리 분류
    const getResponseCategory = (time: number) => {
      if (time <= 3) return 'perfect';      // 🟢 즉시 반응
      if (time <= 8) return 'good';         // 🟡 빠른 반응
      if (time <= 15) return 'slow';        // 🟠 느린 반응
      return 'very_slow';                   // 🔴 매우 느림
    };
    
    const responseCategory = getResponseCategory(responseTimeSeconds);
    
    if (isCorrect) {
      // 초고속 학습 스케줄 (초 단위)
      if (stats.correctCount === 0) {
        newInterval = 30; // 30초
      } else if (stats.correctCount === 1) {
        newInterval = 120; // 2분
      } else if (stats.correctCount === 2) {
        newInterval = 480; // 8분
      } else if (stats.correctCount === 3) {
        newInterval = 1500; // 25분
      } else if (stats.correctCount === 4) {
        newInterval = 3600; // 60분
      } else {
        newInterval = Math.round(stats.interval * 2); // 2시간씩 증가
      }
      
      // 반응 시간에 따른 패널티 적용
      if (responseCategory === 'slow') {
        // 8-15초: 간격 증가율 50% 감소
        newInterval = stats.interval + Math.round((newInterval - stats.interval) * 0.5);
        newWeight = Math.max(0.1, newWeight * 0.75); // 덜 감소
        newEaseFactor = Math.min(2.5, newEaseFactor + 0.1);
      } else if (responseCategory === 'very_slow') {
        // 15초+: 간격 유지, 가중치 오히려 증가
        newInterval = stats.interval;
        newWeight = Math.min(3.0, newWeight * 1.2);
        newEaseFactor = Math.max(1.3, newEaseFactor - 0.1);
      } else {
        // 빠른 반응 (0-8초): 정상 진행
        newWeight = Math.max(0.1, newWeight * 0.5); // 급속 감소
        newEaseFactor = Math.min(2.5, newEaseFactor + 0.3);
      }
      
    } else {
      // 틀린 경우: 10초 후 재출현
      newInterval = 10;
      newWeight = Math.min(3.0, newWeight * 2.0); // 강력한 증가
      newEaseFactor = Math.max(1.3, newEaseFactor - 0.5);
    }
    
    const dueDate = new Date();
    dueDate.setTime(dueDate.getTime() + newInterval * 1000); // 초 단위로 계산
    
    // 반응 시간 통계 업데이트
    const newAverageResponseTime = stats.totalCount > 0 
      ? (stats.averageResponseTime * stats.totalCount + responseTimeSeconds) / (stats.totalCount + 1)
      : responseTimeSeconds;
    
    const newFastAnswers = responseTimeSeconds <= 12 
      ? stats.fastAnswers + (isCorrect ? 1 : 0)
      : stats.fastAnswers;
    
    return {
      ...stats,
      correctCount: isCorrect ? stats.correctCount + 1 : stats.correctCount,
      totalCount: stats.totalCount + 1,
      lastStudied: now,
      weight: newWeight,
      interval: newInterval,
      easeFactor: newEaseFactor,
      dueDate: dueDate,
      averageResponseTime: newAverageResponseTime,
      fastAnswers: newFastAnswers
    };
  };

  const formatSeason = (start, end) => {
    if (!start && !end) return "연중";
    if (start === end) return start;
    return `${start} ~ ${end}`;
  };

  const isCardInSeason = (card: SushiCard) => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    const start = card['제철 시작'];
    const end = card['제철 끝'];
    
    // 연중인 경우 (빈 값이거나 "연중" 문자열)
    if ((!start && !end) || start === '연중' || end === '연중') return 'year_round';
    
    // 월 이름을 숫자로 변환
    const monthNameToNumber = {
      '1월': 1, '2월': 2, '3월': 3, '4월': 4, '5월': 5, '6월': 6,
      '7월': 7, '8월': 8, '9월': 9, '10월': 10, '11월': 11, '12월': 12
    };
    
    const startMonth = monthNameToNumber[start];
    const endMonth = monthNameToNumber[end];
    
    if (!startMonth || !endMonth) return 'out_of_season';
    
    // 같은 달인 경우
    if (startMonth === endMonth) {
      return currentMonth === startMonth ? 'in_season' : 'out_of_season';
    }
    
    // 제철이 연말/연초를 걸치는 경우 (예: 12월~2월)
    if (startMonth > endMonth) {
      return (currentMonth >= startMonth || currentMonth <= endMonth) ? 'in_season' : 'out_of_season';
    }
    
    // 일반적인 경우 (예: 3월~5월)
    return (currentMonth >= startMonth && currentMonth <= endMonth) ? 'in_season' : 'out_of_season';
  };

  const renderStars = (grade) => {
    if (grade === "최고급") return "⭐⭐";
    if (grade === "고급") return "⭐";
    return "";
  };

  const flipCard = () => {
    if (isPaused) return; // 일시정지 중에는 카드 뒤집기 불가
    
    if (!isFlipped) {
      // 카드를 뒤집을 때 시간 기록 시작
      setCardShownTime(new Date());
    }
    setIsFlipped(!isFlipped);
    setShowAnswer(!showAnswer);
  };

  const pauseGame = () => {
    if (cardShownTime && !isPaused) {
      // 일시정지 시점까지의 시간 저장
      setPausedTime(new Date().getTime() - cardShownTime.getTime());
    }
    setIsPaused(true);
  };

  const resumeGame = () => {
    if (cardShownTime && isPaused) {
      // 일시정지된 시간을 고려하여 시작 시간 재조정
      const now = new Date();
      setCardShownTime(new Date(now.getTime() - pausedTime));
    }
    setIsPaused(false);
    setPausedTime(0);
  };

  const handleScreenClick = () => {
    if (isPaused) {
      resumeGame();
    } else if (showAnswer) {
      // 답변 표시 중이 아닐 때만 카드 뒤집기
      return;
    } else {
      flipCard();
    }
  };

  const getResponseTimeMessage = (seconds) => {
    if (seconds <= 3) return { symbol: '★', message: `${seconds.toFixed(1)}초 - 완벽!`, color: 'text-green-600' };
    if (seconds <= 8) return { symbol: '○', message: `${seconds.toFixed(1)}초 - 좋음!`, color: 'text-blue-600' };
    if (seconds <= 15) return { symbol: '△', message: `${seconds.toFixed(1)}초 - 더 빨리!`, color: 'text-orange-600' };
    return { symbol: '×', message: `${seconds.toFixed(1)}초 - 패널티!`, color: 'text-red-600' };
  };

  const getCurrentCardStats = () => {
    const stats = cardStats[currentCardIndex];
    if (!stats) return { difficulty: 0, repetitionCount: 0, weight: 1.0 };

    const accuracy = stats.totalCount > 0 ? stats.correctCount / stats.totalCount : 0;
    const difficulty = Math.round((1 - accuracy) * 100);
    
    // Calculate current weight using same logic as updateWeightedDeck
    const now = new Date();
    const baseUrgency = 1 / (stats.totalCount + 1);
    const difficultyFactor = Math.pow(1 - accuracy, 2) + 0.1;
    
    let recencyFactor;
    if (stats.dueDate <= now) {
      const secondsOverdue = Math.max(0, (now.getTime() - stats.dueDate.getTime()) / 1000);
      recencyFactor = Math.min(3.0, 1.0 + secondsOverdue / 60);
    } else {
      recencyFactor = 0.1;
    }
    
    const priorityScore = baseUrgency * difficultyFactor * recencyFactor;
    const weight = Math.max(1, Math.round(priorityScore * 50));

    return {
      difficulty,
      repetitionCount: stats.totalCount,
      weight
    };
  };

  const getNextCardIndex = () => {
    if (weightedDeck.length === 0) return 0;
    
    // 같은 카드가 연속으로 나오지 않도록 필터링
    const availableCards = weightedDeck.filter(cardIndex => cardIndex !== currentCardIndex);
    
    // 필터링된 카드가 없으면 전체 덱 사용
    const deckToUse = availableCards.length > 0 ? availableCards : weightedDeck;
    
    const randomIndex = Math.floor(Math.random() * deckToUse.length);
    return deckToUse[randomIndex];
  };

  const nextCard = () => {
    if (isPaused) return;
    setIsFlipped(false);
    setShowAnswer(false);
    setCardShownTime(null);
    setResponseTime(null);
    setTimeout(() => {
      const nextIndex = getNextCardIndex();
      setCurrentCardIndex(nextIndex);
    }, 50);
  };

  const prevCard = () => {
    if (isPaused) return;
    setIsFlipped(false);
    setShowAnswer(false);
    setCardShownTime(null);
    setResponseTime(null);
    setTimeout(() => {
      setCurrentCardIndex((prev) => (prev - 1 + sushiData.length) % sushiData.length);
    }, 50);
  };

  const recordStudy = (cardIndex, isCorrect) => {
    if (isPaused) return; // 일시정지 중에는 기록하지 않음
    
    const now = new Date();
    const card = sushiData[cardIndex];
    
    // 반응 시간 계산 (일시정지 시간 제외)
    let responseTimeSeconds = 0;
    if (cardShownTime) {
      responseTimeSeconds = (now.getTime() - cardShownTime.getTime()) / 1000;
      setResponseTime(responseTimeSeconds);
    }
    
    // 학습 기록 추가
    const newRecord = {
      timestamp: now.toISOString(),
      cardIndex: cardIndex,
      kanji: card.한자,
      kana: card.가나,
      korean: card.한국어명,
      isCorrect: isCorrect,
      reviewNumber: cardStats[cardIndex].totalCount + 1,
      responseTime: responseTimeSeconds
    };
    
    setStudyHistory(prev => [...prev, newRecord]);
    
    // 카드 통계 업데이트 (반응 시간 포함)
    const newStats = calculateNextReview(cardIndex, isCorrect, responseTimeSeconds);
    setCardStats(prev => ({
      ...prev,
      [cardIndex]: newStats
    }));
  };

  const markCorrect = () => {
    if (isPaused) return;
    recordStudy(currentCardIndex, true);
    setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    setIsFlipped(false);
    setShowAnswer(false);
    setCardShownTime(null);
    setResponseTime(null);
    setTimeout(() => {
      const nextIndex = getNextCardIndex();
      setCurrentCardIndex(nextIndex);
    }, 50);
  };

  const markIncorrect = () => {
    if (isPaused) return;
    recordStudy(currentCardIndex, false);
    setScore(prev => ({ correct: prev.correct, total: prev.total + 1 }));
    setIsFlipped(false);
    setShowAnswer(false);
    setCardShownTime(null);
    setResponseTime(null);
    setTimeout(() => {
      const nextIndex = getNextCardIndex();
      setCurrentCardIndex(nextIndex);
    }, 50);
  };

  const shuffle = () => {
    updateWeightedDeck();
    setIsFlipped(false);
    setShowAnswer(false);
    setTimeout(() => {
      const nextIndex = getNextCardIndex();
      setCurrentCardIndex(nextIndex);
    }, 50);
  };

  const exportDataAsCSV = () => {
    if (studyHistory.length === 0) {
      alert('내보낼 학습 기록이 없습니다. 먼저 카드를 학습해주세요.');
      return;
    }

    try {
      // CSV 헤더
      const headers = ['타임스탬프', '카드인덱스', '한자', '가나', '한국어명', '정답여부', '복습횟수', '반응시간'];
      
      // CSV 데이터 행들
      const csvRows = [headers.join(',')];
      
      studyHistory.forEach(record => {
        const row = [
          record.timestamp || '',
          record.cardIndex || 0,
          `"${(record.kanji || '').replace(/"/g, '""')}"`,
          `"${(record.kana || '').replace(/"/g, '""')}"`,
          `"${(record.korean || '').replace(/"/g, '""')}"`,
          record.isCorrect ? '정답' : '오답',
          record.reviewNumber || 1,
          (record.responseTime || 0).toFixed(1)
        ];
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      
      // Blob 방식으로 다시 시도 (더 안전함)
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { 
        type: 'text/csv;charset=utf-8' 
      });
      
      // 다운로드 링크 생성
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `스시_학습기록_${new Date().toISOString().slice(0, 10)}.csv`;
      link.style.display = 'none';
      
      // 링크 클릭하여 다운로드
      document.body.appendChild(link);
      link.click();
      
      // 정리
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      alert(`학습 기록 ${studyHistory.length}개가 CSV 파일로 저장되었습니다.`);
      
    } catch (error) {
      console.error('CSV 내보내기 오류:', error);
      alert('CSV 파일 내보내기에 실패했습니다. 브라우저 콘솔을 확인해주세요.');
    }
  };

  const deleteCurrentCard = () => {
    console.log('deleteCurrentCard 함수 호출됨');
    console.log('현재 카드 인덱스:', currentCardIndex);
    console.log('전체 카드 수:', sushiData.length);
    
    if (sushiData.length <= 1) {
      alert('마지막 카드는 삭제할 수 없습니다.');
      return;
    }

    if (currentCardIndex >= sushiData.length || currentCardIndex < 0) {
      alert('잘못된 카드 인덱스입니다.');
      return;
    }

    const currentCard = sushiData[currentCardIndex];
    console.log('삭제할 카드:', currentCard);
    
    if (!currentCard) {
      alert('현재 카드를 찾을 수 없습니다.');
      return;
    }

    const confirmMessage = `"${currentCard.한자} (${currentCard.가나}) - ${currentCard.한국어명}" 카드를 삭제하시겠습니까?\n\n이 카드와 관련된 모든 학습 기록도 함께 삭제됩니다.`;
    
    if (!window.confirm(confirmMessage)) {
      console.log('사용자가 삭제를 취소함');
      return;
    }

    console.log('카드 삭제 시작...');

    try {
      // 카드 목록에서 현재 카드 제거
      const newSushiData = sushiData.filter((_, index) => index !== currentCardIndex);
      console.log('새 카드 목록 크기:', newSushiData.length);
      setSushiData(newSushiData);

      // 해당 카드의 학습 기록 제거
      const newStudyHistory = studyHistory.filter(record => record.cardIndex !== currentCardIndex);
      console.log('삭제된 학습 기록:', studyHistory.length - newStudyHistory.length);
      
      // 삭제된 카드 이후의 카드들 인덱스 조정
      const adjustedHistory = newStudyHistory.map(record => ({
        ...record,
        cardIndex: record.cardIndex > currentCardIndex ? record.cardIndex - 1 : record.cardIndex
      }));
      
      setStudyHistory(adjustedHistory);

      // 카드 통계 재구성
      const newCardStats = {};
      newSushiData.forEach((card, index) => {
        const oldIndex = index >= currentCardIndex ? index + 1 : index;
        if (cardStats[oldIndex]) {
          newCardStats[index] = cardStats[oldIndex];
        } else {
          newCardStats[index] = {
            correctCount: 0,
            totalCount: 0,
            lastStudied: null,
            weight: 1.0,
            interval: 1,
            easeFactor: 2.5,
            dueDate: new Date()
          };
        }
      });
      setCardStats(newCardStats);

      // 점수 재계산
      const totalCorrect = adjustedHistory.filter(record => record.isCorrect).length;
      setScore({ correct: totalCorrect, total: adjustedHistory.length });

      // 현재 카드 인덱스 조정
      let newIndex = currentCardIndex;
      if (currentCardIndex >= newSushiData.length) {
        newIndex = newSushiData.length - 1;
      }
      if (newIndex < 0) newIndex = 0;
      
      console.log('새 카드 인덱스:', newIndex);
      
      setCurrentCardIndex(newIndex);
      setIsFlipped(false);
      setShowAnswer(false);

      // Save to localStorage
      saveToLocalStorage(STORAGE_KEYS.SUSHI_DATA, newSushiData);
      saveToLocalStorage(STORAGE_KEYS.STUDY_HISTORY, adjustedHistory);
      saveToLocalStorage(STORAGE_KEYS.CARD_STATS, newCardStats);
      saveToLocalStorage(STORAGE_KEYS.SCORE, { correct: totalCorrect, total: adjustedHistory.length });

      alert(`카드가 삭제되었습니다. 남은 카드: ${newSushiData.length}개`);
      console.log('카드 삭제 완료');
      
    } catch (error) {
      console.error('카드 삭제 중 오류:', error);
      alert('카드 삭제 중 오류가 발생했습니다: ' + error.message);
    }
  };

  const exportCardsAsCSV = () => {
    if (sushiData.length === 0) {
      alert('내보낼 카드가 없습니다.');
      return;
    }

    try {
      // CSV 헤더
      const headers = ['한자', '가나', '한국어명', '제철 시작', '제철 끝', '고급 여부'];
      
      // CSV 데이터 행들
      const csvRows = [headers.join(',')];
      
      sushiData.forEach(card => {
        const row = [
          `"${(card.한자 || '').replace(/"/g, '""')}"`,
          `"${(card.가나 || '').replace(/"/g, '""')}"`,
          `"${(card.한국어명 || '').replace(/"/g, '""')}"`,
          `"${(card['제철 시작'] || '').replace(/"/g, '""')}"`,
          `"${(card['제철 끝'] || '').replace(/"/g, '""')}"`,
          `"${(card['고급 여부'] || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      
      // Blob으로 다운로드
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { 
        type: 'text/csv;charset=utf-8' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `스시_카드목록_${new Date().toISOString().slice(0, 10)}.csv`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      alert(`${sushiData.length}개의 카드 목록이 CSV 파일로 저장되었습니다.`);
      
    } catch (error) {
      console.error('카드 목록 내보내기 오류:', error);
      alert('카드 목록 내보내기에 실패했습니다.');
    }
  };

  const importCardsFromCSV = async (file) => {
    try {
      const text = await file.text();
      const Papa = await import('papaparse');
      
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
      });

      // 새 카드 데이터 매핑 (다양한 컬럼명 지원)
      const newCards = parsed.data.map(row => ({
        한자: row['한자'] || row['kanji'] || row['漢字'] || '',
        가나: row['가나'] || row['kana'] || row['かな'] || row['읽기'] || '',
        한국어명: row['한국어명'] || row['korean'] || row['한국어'] || row['이름'] || '',
        '제철 시작': row['제철 시작'] || row['season_start'] || row['제철시작'] || '',
        '제철 끝': row['제철 끝'] || row['season_end'] || row['제철끝'] || '',
        '고급 여부': row['고급 여부'] || row['grade'] || row['등급'] || row['고급여부'] || ''
      })).filter(card => card.한자 && card.가나 && card.한국어명); // 필수 필드가 있는 카드만

      if (newCards.length === 0) {
        alert('유효한 카드 데이터가 없습니다. 한자, 가나, 한국어명이 모두 포함된 CSV 파일인지 확인해주세요.');
        return;
      }

      // 중복 제거 (한자와 가나를 기준으로)
      const existingCards = new Set(sushiData.map(card => `${card.한자}-${card.가나}`));
      const uniqueNewCards = newCards.filter(card => 
        !existingCards.has(`${card.한자}-${card.가나}`)
      );

      if (uniqueNewCards.length === 0) {
        alert('모든 카드가 이미 존재합니다. 중복되지 않는 새로운 카드가 없습니다.');
        return;
      }

      // 기존 카드 목록에 새 카드 추가
      const updatedSushiData = [...sushiData, ...uniqueNewCards];
      setSushiData(updatedSushiData);

      // 새 카드들에 대한 통계 초기화
      const newCardStats = { ...cardStats };
      const startIndex = sushiData.length;
      
      uniqueNewCards.forEach((card, index) => {
        const cardIndex = startIndex + index;
        newCardStats[cardIndex] = {
          correctCount: 0,
          totalCount: 0,
          lastStudied: null,
          weight: 1.0,
          interval: 1,
          easeFactor: 2.5,
          dueDate: new Date(),
          averageResponseTime: 0,
          fastAnswers: 0
        };
      });
      
      setCardStats(newCardStats);

      // Save to localStorage
      saveToLocalStorage(STORAGE_KEYS.SUSHI_DATA, updatedSushiData);
      saveToLocalStorage(STORAGE_KEYS.CARD_STATS, newCardStats);

      alert(`${uniqueNewCards.length}개의 새로운 카드가 추가되었습니다!\n(중복 제외: ${newCards.length - uniqueNewCards.length}개)\n전체 카드: ${updatedSushiData.length}개`);

    } catch (error) {
      console.error('카드 CSV 불러오기 오류:', error);
      alert('카드 CSV 파일을 불러오는 중 오류가 발생했습니다: ' + error.message);
    }
  };

  const importDataFromCSV = async (file) => {
    try {
      const text = await file.text();
      const Papa = await import('papaparse');
      
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
      });

      const importedHistory = parsed.data.map((row: any) => {
        // 한자/가나/한국어명으로 올바른 카드 인덱스 찾기
        const kanji = row['한자'] || row.kanji;
        const kana = row['가나'] || row.kana;
        const korean = row['한국어명'] || row.korean;
        
        const correctCardIndex = sushiData.findIndex(card => 
          card.한자 === kanji && card.가나 === kana && card.한국어명 === korean
        );
        
        if (correctCardIndex === -1) {
          console.warn(`카드를 찾을 수 없음: ${kanji} (${kana}, ${korean})`);
          return null;
        }
        
        return {
          timestamp: row['타임스탬프'] || row.timestamp,
          cardIndex: correctCardIndex, // 올바른 인덱스 사용
          kanji,
          kana,
          korean,
          isCorrect: (row['정답여부'] || row.isCorrect) === '정답' || (row['정답여부'] || row.isCorrect) === 'true' || (row['정답여부'] || row.isCorrect) === true,
          reviewNumber: parseInt(row['복습횟수'] || row.reviewNumber) || 1,
          responseTime: 0
        };
      }).filter(record => record !== null);

      // 기존 기록과 합치기
      const allHistory = [...studyHistory, ...importedHistory];
      
      // 시간순 정렬
      allHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      setStudyHistory(allHistory);

      // 카드 통계 재계산
      const newCardStats = {};
      sushiData.forEach((card, index) => {
        newCardStats[index] = {
          correctCount: 0,
          totalCount: 0,
          lastStudied: null,
          weight: 1.0,
          interval: 1,
          easeFactor: 2.5,
          dueDate: new Date(),
          averageResponseTime: 0,
          fastAnswers: 0
        };
      });

      // 먼저 전체 기록을 순회하여 기본 통계 수집
      allHistory.forEach(record => {
        const cardIndex = record.cardIndex;
        if (newCardStats[cardIndex]) {
          const stats = newCardStats[cardIndex];
          
          if (record.isCorrect) {
            stats.correctCount++;
          }
          stats.totalCount++;
          stats.lastStudied = new Date(record.timestamp);
        }
      });

      // 각 카드별로 학습 기록을 시간순으로 재생하여 정확한 spaced repetition 상태 계산
      Object.keys(newCardStats).forEach(cardIndex => {
        const cardHistory = allHistory.filter(record => record.cardIndex === parseInt(cardIndex))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        if (cardHistory.length > 0) {
          const stats = newCardStats[cardIndex];
          let currentCorrectCount = 0;
          
          // 각 기록을 순차적으로 처리하여 spaced repetition 계산
          cardHistory.forEach((record, index) => {
            if (record.isCorrect) {
              currentCorrectCount++;
            }
            
            // 마지막 기록에만 다음 복습 일정 계산 적용
            if (index === cardHistory.length - 1) {
              const recordTime = new Date(record.timestamp);
              
              if (record.isCorrect) {
                // 정답 시 간격 계산 (초 단위)
                if (currentCorrectCount === 1) {
                  stats.interval = 30; // 30초
                } else if (currentCorrectCount === 2) {
                  stats.interval = 120; // 2분  
                } else if (currentCorrectCount === 3) {
                  stats.interval = 480; // 8분
                } else if (currentCorrectCount === 4) {
                  stats.interval = 1500; // 25분
                } else if (currentCorrectCount === 5) {
                  stats.interval = 3600; // 60분
                } else {
                  stats.interval = Math.round(stats.interval * 2); // 2배씩 증가
                }
                stats.weight = Math.max(0.1, stats.weight * 0.5);
                stats.easeFactor = Math.min(2.5, stats.easeFactor + 0.1);
              } else {
                // 오답 시
                stats.interval = 10; // 10초 후 재출현
                stats.weight = Math.min(3.0, stats.weight * 2.0);
                stats.easeFactor = Math.max(1.3, stats.easeFactor - 0.2);
              }
              
              // 다음 복습 예정일 계산 (마지막 학습 시간 + 간격)
              const dueDate = new Date(recordTime.getTime() + stats.interval * 1000);
              stats.dueDate = dueDate;
            }
          });
        }
      });

      setCardStats(newCardStats);
      
      // 점수 재계산
      const totalCorrect = allHistory.filter(record => record.isCorrect).length;
      const newScore = { correct: totalCorrect, total: allHistory.length };
      setScore(newScore);

      // Save to localStorage
      saveToLocalStorage(STORAGE_KEYS.STUDY_HISTORY, allHistory);
      saveToLocalStorage(STORAGE_KEYS.CARD_STATS, newCardStats);
      saveToLocalStorage(STORAGE_KEYS.SCORE, newScore);

      alert(`${importedHistory.length}개의 학습 기록을 불러왔습니다!`);
    } catch (error) {
      console.error('학습기록 CSV 불러오기 오류:', error);
      alert('학습기록 CSV 파일을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleStudyDataUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      importDataFromCSV(file);
    } else {
      alert('CSV 파일만 업로드 가능합니다.');
    }
    event.target.value = '';
  };

  const handleCardDataUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      importCardsFromCSV(file);
    } else {
      alert('CSV 파일만 업로드 가능합니다.');
    }
    event.target.value = '';
  };

  const resetProgress = () => {
    if (confirm('모든 학습 기록을 초기화하시겠습니까?')) {
      setStudyHistory([]);
      setScore({ correct: 0, total: 0 });
      initializeCardStats(sushiData);
      
      // Clear from localStorage
      localStorage.removeItem(STORAGE_KEYS.STUDY_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.CARD_STATS);
      localStorage.removeItem(STORAGE_KEYS.SCORE);
    }
  };

  const getRecentHistory = (cardIndex, count = 8) => {
    return studyHistory
      .filter(record => record.cardIndex === cardIndex)
      .slice(-count)
      .map(record => record.isCorrect);
  };

  const calculateConsistency = (recentResults) => {
    if (recentResults.length < 2) return 1;
    
    let changes = 0;
    for (let i = 1; i < recentResults.length; i++) {
      if (recentResults[i] !== recentResults[i-1]) changes++;
    }
    
    return Math.max(0, 1 - (changes / (recentResults.length - 1)));
  };

  const getDifficultyScore = (cardIndex) => {
    const stats = cardStats[cardIndex];
    if (!stats || stats.totalCount < 3) {
      return { 
        score: 0, 
        category: 'insufficient_data', 
        accuracy: 0,
        description: '데이터 부족'
      };
    }
    
    // 1. 일반 정답률
    const regularAccuracy = stats.correctCount / stats.totalCount;
    
    // 2. 베이지안 정답률 (사전분포: α=0.5, β=0.5, 보정 강도 줄임)
    const bayesianAccuracy = (stats.correctCount + 0.5) / (stats.totalCount + 1);
    
    // 3. 시도 횟수 가중치 (더 부드러운 스케일)
    const trialWeight = Math.min(stats.totalCount / 10, 1);
    
    // 4. 일관성 페널티 (최근 결과의 변동성)
    const recentResults = getRecentHistory(cardIndex, Math.min(8, stats.totalCount));
    const consistency = calculateConsistency(recentResults);
    
    // 5. 반응시간 페널티 (더 완만한 스케일)
    const avgResponseTime = stats.averageResponseTime || 5;
    const responseTimePenalty = Math.min(Math.max(avgResponseTime / 10, 0.5), 2);
    
    // 6. 종합 어려움 점수 (공식 개선)
    const baseError = 1 - bayesianAccuracy;
    const consistencyPenalty = 2 - consistency; // 1~2 범위
    const difficultyScore = baseError * trialWeight * consistencyPenalty * responseTimePenalty;
    
    // 7. 카테고리 분류 (임계값 조정)
    let category, description;
    if (difficultyScore > 1.0) {
      category = 'very_hard';
      description = '매우 어려움';
    } else if (difficultyScore > 0.6) {
      category = 'hard';
      description = '어려움';
    } else if (difficultyScore > 0.3) {
      category = 'medium';
      description = '보통';
    } else {
      category = 'easy';
      description = '쉬움';
    }
    
    return { 
      score: difficultyScore, 
      category, 
      accuracy: regularAccuracy, // 일반 정답률 반환
      description,
      consistency,
      responseTimePenalty,
      bayesianAccuracy
    };
  };

  const getCardProgress = (cardIndex) => {
    const stats = cardStats[cardIndex];
    if (!stats || stats.totalCount === 0) return null;
    
    const accuracy = Math.round((stats.correctCount / stats.totalCount) * 100);
    const nextReviewSeconds = Math.ceil((stats.dueDate.getTime() - new Date().getTime()) / 1000);
    const nextReviewText = nextReviewSeconds > 0 
      ? `${Math.floor(nextReviewSeconds / 60)}분 ${nextReviewSeconds % 60}초 후`
      : '복습 예정';
    
    return { 
      accuracy, 
      nextReview: nextReviewText, 
      totalReviews: stats.totalCount,
      averageResponseTime: stats.averageResponseTime || 0,
      fastAnswers: stats.fastAnswers || 0
    };
  };

  if (sushiData.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">데이터를 로딩 중입니다...</div>
      </div>
    );
  }

  const currentCard = sushiData[currentCardIndex];
  const cardProgress = getCardProgress(currentCardIndex);
  const dueCardsCount = Object.values(cardStats).filter(stats => 
    stats.dueDate <= new Date() || stats.totalCount === 0
  ).length;

  return (
    <div className="min-h-screen bg-white p-4" onClick={handleScreenClick}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8" onClick={(e) => e.stopPropagation()}>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">🍣 스시 네타 플래시카드</h1>
          <div className="flex justify-center items-center space-x-4 mb-4 text-sm text-gray-600">
            <div>카드: {currentCardIndex + 1} / {sushiData.length}</div>
            <div>정답률: {score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}% ({score.correct}/{score.total})</div>
            <div>복습 대기: {dueCardsCount}개</div>
            <div>총 기록: {studyHistory.length}개</div>
          </div>
          
          {cardProgress && (
            <div className="text-sm text-gray-500 mb-4">
              이 카드: {cardProgress.accuracy}% 정답률 ({cardProgress.totalReviews}회 학습) 
              • 평균 반응시간: {(cardProgress.averageResponseTime || 0).toFixed(1)}초
              • 빠른 답변: {cardProgress.fastAnswers}회
              • {cardProgress.nextReview}
            </div>
          )}

          {responseTime && !isPaused && (
            <div className="mb-4">
              <div className={`text-lg font-bold ${getResponseTimeMessage(responseTime).color}`}>
                {getResponseTimeMessage(responseTime).symbol} {getResponseTimeMessage(responseTime).message}
              </div>
            </div>
          )}

          {/* Main buttons */}
          <div className="flex justify-center space-x-2 mb-3">
            <button onClick={() => setShowStatsPage(!showStatsPage)} className="px-3 py-1 bg-gray-700 text-white text-sm rounded hover:bg-gray-800 transition-colors">
              {showStatsPage ? '학습 모드' : '통계 보기'}
            </button>
            <button onClick={exportDataAsCSV} className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors">
              학습기록 내보내기
            </button>
            <label className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors cursor-pointer">
              학습기록 불러오기
              <input
                type="file"
                accept=".csv"
                onChange={handleStudyDataUpload}
                className="hidden"
              />
            </label>
          </div>

        </div>

        {/* Statistics Page */}
        {showStatsPage ? (
          <div className="mb-8" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">카드 학습 통계</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSeasonalSortEnabled(!seasonalSortEnabled)}
                    className={`px-3 py-1 text-white text-sm rounded transition-colors ${
                      seasonalSortEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    {seasonalSortEnabled ? '🌸 제철순' : '제철순'}
                  </button>
                  <button
                    onClick={() => setStatsSortOrder(statsSortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  >
                    어려움 {statsSortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left p-2">어려움</th>
                      <th className="text-left p-2">정답률</th>
                      <th className="text-left p-2">횟수</th>
                      <th className="text-left p-2">한자</th>
                      <th className="text-left p-2">가나</th>
                      <th className="text-left p-2">한국어명</th>
                      <th className="text-left p-2">제철</th>
                      <th className="text-left p-2">등급</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sushiData
                      .map((card, index) => {
                        const difficulty = getDifficultyScore(index);
                        const stats = cardStats[index];
                        const seasonalStatus = isCardInSeason(card);
                        // 일반 정답률 (통계 표시용)
                        const regularAccuracy = stats && stats.totalCount > 0 
                          ? Math.round((stats.correctCount / stats.totalCount) * 100)
                          : 0;
                        
                        return {
                          index,
                          card,
                          difficulty,
                          stats,
                          regularAccuracy,
                          seasonalStatus
                        };
                      })
                      .sort((a, b) => {
                        if (seasonalSortEnabled) {
                          // 제철 우선 정렬
                          const seasonalPriority = {
                            'in_season': 0,
                            'year_round': 1,
                            'out_of_season': 2
                          };
                          
                          const aPriority = seasonalPriority[a.seasonalStatus];
                          const bPriority = seasonalPriority[b.seasonalStatus];
                          
                          if (aPriority !== bPriority) {
                            return aPriority - bPriority;
                          }
                          
                          // 같은 제철 그룹 내에서는 어려움 순으로 정렬
                          const sortMultiplier = statsSortOrder === 'desc' ? -1 : 1;
                          return (b.difficulty.score - a.difficulty.score) * sortMultiplier;
                        } else {
                          // 기본 어려움 정렬
                          const sortMultiplier = statsSortOrder === 'desc' ? -1 : 1;
                          return (b.difficulty.score - a.difficulty.score) * sortMultiplier;
                        }
                      })
                      .map(({ index, card, difficulty, stats, regularAccuracy, seasonalStatus }) => {
                        const getDifficultyColor = (category) => {
                          switch (category) {
                            case 'very_hard': return 'text-red-800 bg-gray-100 border border-red-300';
                            case 'hard': return 'text-red-600 bg-gray-50 border border-red-200';
                            case 'medium': return 'text-orange-600 bg-gray-50 border border-orange-200';
                            case 'easy': return 'text-green-600 bg-gray-50 border border-green-200';
                            default: return 'text-gray-500 bg-gray-50 border border-gray-200';
                          }
                        };

                        const getRowHighlight = (seasonalStatus) => {
                          switch (seasonalStatus) {
                            case 'in_season': return 'bg-green-100 border-l-4 border-l-green-500';
                            case 'year_round': return 'bg-gray-50 border-l-4 border-l-gray-400';
                            default: return '';
                          }
                        };

                        return (
                          <tr key={index} className={`border-b border-gray-100 hover:bg-gray-50 ${getRowHighlight(seasonalStatus)}`}>
                            <td className="p-2">
                              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getDifficultyColor(difficulty.category)}`}>
                                {difficulty.score.toFixed(2)}
                                <br />
                                <span className="text-xs">{difficulty.description}</span>
                              </div>
                            </td>
                            <td className="p-2">
                              <div className="font-medium">{regularAccuracy}%</div>
                              {stats && (
                                <div className="text-xs text-gray-500">
                                  {stats.correctCount}/{stats.totalCount}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-center">{stats ? stats.totalCount : 0}</td>
                            <td className="p-2">
                              <div className="text-lg font-bold text-gray-800">{card.한자}</div>
                            </td>
                            <td className="p-2">
                              <div className="text-gray-600">{card.가나}</div>
                            </td>
                            <td className="p-2">
                              <div className="font-medium">{card.한국어명}</div>
                            </td>
                            <td className="p-2 text-xs text-gray-500">
                              {formatSeason(card['제철 시작'], card['제철 끝'])}
                            </td>
                            <td className="p-2 text-center">
                              {renderStars(card['고급 여부'])}
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
              
              <div className="mt-6 text-sm text-gray-600">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-50 border border-red-300 p-3 rounded">
                    <div className="text-red-800 font-bold text-xs">매우 어려움</div>
                    <div className="text-xs text-gray-600">점수 &gt; 1.0</div>
                  </div>
                  <div className="bg-gray-50 border border-red-200 p-3 rounded">
                    <div className="text-red-600 font-bold text-xs">어려움</div>
                    <div className="text-xs text-gray-600">0.6 &lt; 점수 &le; 1.0</div>
                  </div>
                  <div className="bg-gray-50 border border-orange-200 p-3 rounded">
                    <div className="text-orange-600 font-bold text-xs">보통</div>
                    <div className="text-xs text-gray-600">0.3 &lt; 점수 &le; 0.6</div>
                  </div>
                  <div className="bg-gray-50 border border-green-200 p-3 rounded">
                    <div className="text-green-600 font-bold text-xs">쉬움</div>
                    <div className="text-xs text-gray-600">점수 &le; 0.3</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  어려움 지수는 정답률, 학습 횟수, 일관성, 반응시간을 종합하여 계산됩니다.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
          {/* Card */}
          <div className="relative mb-8">
          <div className="w-full h-96 cursor-pointer" onClick={handleScreenClick}>
            <div className={`absolute inset-0 w-full h-full transition-transform duration-600 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
              {/* Front of card */}
              <div className={`absolute inset-0 w-full h-full backface-hidden bg-white rounded-xl shadow-lg border-2 border-gray-200 flex flex-col justify-center items-center p-8 ${isPaused ? 'filter blur-lg' : ''}`}>
                {/* Card stats at the top */}
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 flex space-x-4">
                  <span>어려움: {getCurrentCardStats().difficulty}%</span>
                  <span>횟수: {getCurrentCardStats().repetitionCount}</span>
                  <span>가중치: {getCurrentCardStats().weight}</span>
                </div>
                
                <div className="text-center">
                  <div className="text-6xl font-bold text-gray-800 mb-4">
                    {currentCard.한자}
                  </div>
                  <div className="text-3xl text-gray-600">
                    {currentCard.가나}
                  </div>
                </div>
                {!isPaused && (
                  <div className="absolute bottom-4 text-sm text-gray-400">
                    클릭해서 뒤집기
                  </div>
                )}
              </div>

              {/* Back of card */}
              <div className={`absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-white rounded-xl shadow-lg border-2 border-gray-200 flex flex-col justify-center items-center p-8 ${isPaused ? 'filter blur-lg' : ''}`}>
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-800 mb-6">
                    {currentCard.한국어명}
                  </div>
                  <div className="text-2xl text-gray-600 mb-4">
                    {formatSeason(currentCard['제철 시작'], currentCard['제철 끝'])}
                  </div>
                  <div className="text-3xl">
                    {renderStars(currentCard['고급 여부'])}
                  </div>
                </div>
                {!isPaused && (
                  <div className="absolute bottom-4 text-sm text-gray-400">
                    클릭해서 뒤집기
                  </div>
                )}
              </div>
            </div>

            {/* Pause Overlay */}
            {isPaused && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-xl">
                <div className="text-center text-white">
                  <div className="text-4xl mb-4">‖</div>
                  <div className="text-2xl font-bold mb-2">일시정지</div>
                  <div className="text-lg">화면을 클릭하여 계속하기</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center space-x-4 mb-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={prevCard} disabled={isPaused} className={`px-6 py-3 text-gray-700 rounded-lg transition-colors ${isPaused ? 'bg-gray-300 text-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}>
            ← 이전
          </button>
          <button onClick={pauseGame} disabled={isPaused} className={`px-6 py-3 text-gray-700 rounded-lg transition-colors ${isPaused ? 'bg-gray-300 text-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}>
            일시정지
          </button>
          <button onClick={flipCard} disabled={isPaused} className={`px-6 py-3 text-gray-700 rounded-lg transition-colors ${isPaused ? 'bg-gray-300 text-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}>
            {isFlipped ? '앞면 보기' : '뒷면 보기'}
          </button>
          <button onClick={nextCard} disabled={isPaused} className={`px-6 py-3 text-gray-700 rounded-lg transition-colors ${isPaused ? 'bg-gray-300 text-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}>
            다음 →
          </button>
        </div>

        {/* Score buttons - Fixed height container */}
        <div className="flex justify-center space-x-4 mb-8 h-12" onClick={(e) => e.stopPropagation()}>
          {showAnswer && !isPaused && (
            <>
              <button onClick={markIncorrect} className="px-6 py-3 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors">
                × 틀렸음
              </button>
              <button onClick={markCorrect} className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                ○ 맞았음
              </button>
            </>
          )}
        </div>

        {/* Management buttons */}
        <div className="flex justify-center space-x-3 mb-6" onClick={(e) => e.stopPropagation()}>
          <button onClick={deleteCurrentCard} disabled={isPaused} className={`px-3 py-2 text-white text-sm rounded-lg transition-colors ${isPaused ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}>
            × 현재 카드 삭제
          </button>
          <button onClick={resetProgress} disabled={isPaused} className={`px-3 py-2 text-white text-sm rounded-lg transition-colors ${isPaused ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}>
            ↺ 전체 초기화
          </button>
          <button onClick={exportCardsAsCSV} className="px-3 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">
            카드목록 내보내기
          </button>
          <label className="px-3 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
            카드 추가
            <input
              type="file"
              accept=".csv"
              onChange={handleCardDataUpload}
              className="hidden"
            />
          </label>
        </div>
        </>
        )}
      </div>

      <style>{`
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  );
};

export default SushiFlashcards;