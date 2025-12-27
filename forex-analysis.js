// ============================================
// COMPLETE FOREX TECHNICAL ANALYSIS SCRIPT
// Fetches data from TwelveData API and performs comprehensive analysis
// ============================================

const API_KEYS = {
  daily: process.env.TWELVEDATA_API_KEY_DAILY,
  h4: process.env.TWELVEDATA_API_KEY_H4
};

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  pairs: [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 
    'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY'
  ],
  intervals: {
    daily: { interval: '1day', outputsize: 100 },
    h4: { interval: '4h', outputsize: 200 }
  },
  apiDelay: 1000 // Delay between API calls to avoid rate limits
};

// ============================================
// DATA FETCHING
// ============================================

async function fetchData(pair, interval, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${pair}&interval=${interval}&outputsize=${CONFIG.intervals[interval === '1day' ? 'daily' : 'h4'].outputsize}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'error') {
      throw new Error(data.message || 'API Error');
    }
    
    return data.values || [];
  } catch (error) {
    console.error(`Error fetching ${pair} (${interval}):`, error.message);
    return [];
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllData(pairs) {
  const results = [];
  
  for (const pair of pairs) {
    console.log(`Fetching data for ${pair}...`);
    
    // Fetch both timeframes
    const [h4Data, dailyData] = await Promise.all([
      fetchData(pair, '4h', API_KEYS.h4),
      fetchData(pair, '1day', API_KEYS.daily)
    ]);
    
    results.push({
      pair,
      h4: h4Data,
      daily: dailyData
    });
    
    // Delay to respect rate limits
    await delay(CONFIG.apiDelay);
  }
  
  return results;
}

// ============================================
// DATA NORMALIZATION
// ============================================

function normalize(data) {
  if (!data || !Array.isArray(data)) return [];
  
  return data.slice().sort((a, b) => 
    new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  ).map(c => ({
    time: c.datetime,
    timestamp: new Date(c.datetime).getTime(),
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume || 0)
  }));
}

// ============================================
// TECHNICAL INDICATORS
// ============================================

function calculateSMA(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

function calculateEMA(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];
  
  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return [];
  
  const changes = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }
  
  const rsi = [];
  for (let i = period - 1; i < changes.length; i++) {
    const slice = changes.slice(i - period + 1, i + 1);
    const gains = slice.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(slice.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    
    const rs = losses === 0 ? 100 : gains / losses;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

function calculateMACD(candles) {
  const closes = candles.map(c => c.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  if (ema12.length === 0 || ema26.length === 0) {
    return { macd: [], signal: [], histogram: [] };
  }
  
  const startIndex = 26 - 12;
  const macdLine = [];
  for (let i = 0; i < ema12.length - startIndex; i++) {
    macdLine.push(ema12[i + startIndex] - ema26[i]);
  }
  
  const signalLine = calculateEMA(macdLine, 9);
  const histogram = [];
  const offset = macdLine.length - signalLine.length;
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + offset] - signalLine[i]);
  }
  
  return { macd: macdLine, signal: signalLine, histogram };
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return { current: 0, values: [] };
  
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  
  const atrValues = [];
  for (let i = period - 1; i < tr.length; i++) {
    atrValues.push(tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  
  return { 
    current: atrValues[atrValues.length - 1] || 0,
    values: atrValues
  };
}

function calculateBollingerBands(candles, period = 20, stdDev = 2) {
  if (candles.length < period) return { upper: [], middle: [], lower: [] };
  
  const closes = candles.map(c => c.close);
  const middle = [];
  const upper = [];
  const lower = [];
  
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    middle.push(sma);
    upper.push(sma + std * stdDev);
    lower.push(sma - std * stdDev);
  }
  
  return { upper, middle, lower };
}

function calculateStochastic(candles, period = 14, smoothK = 3, smoothD = 3) {
  if (candles.length < period) return { k: [], d: [] };
  
  const rawK = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    
    const k = ((close - low) / (high - low)) * 100;
    rawK.push(isNaN(k) ? 50 : k);
  }
  
  const smoothedK = calculateSMA(rawK, smoothK);
  const smoothedD = calculateSMA(smoothedK, smoothD);
  
  return { k: smoothedK, d: smoothedD };
}

function calculateADX(candles, period = 14) {
  if (candles.length < period + 1) return { adx: 0, plusDI: 0, minusDI: 0, values: [] };
  
  const tr = [], plusDM = [], minusDM = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high - candles[i - 1].high;
    const low = candles[i - 1].low - candles[i].low;
    
    plusDM.push(high > low && high > 0 ? high : 0);
    minusDM.push(low > high && low > 0 ? low : 0);
    
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  
  const adxValues = [];
  for (let i = period - 1; i < tr.length; i++) {
    const avgTR = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgPlusDM = plusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgMinusDM = minusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    
    const plusDI = (avgPlusDM / avgTR) * 100;
    const minusDI = (avgMinusDM / avgTR) * 100;
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    
    adxValues.push({ adx: dx, plusDI, minusDI });
  }
  
  const current = adxValues[adxValues.length - 1] || { adx: 0, plusDI: 0, minusDI: 0 };
  return { ...current, values: adxValues };
}

// ============================================
// MARKET STRUCTURE
// ============================================

function identifySwingPoints(candles, lookback = 5) {
  const swings = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= candles[i].high || candles[i + j].high >= candles[i].high) {
        isHigh = false;
      }
      if (candles[i - j].low <= candles[i].low || candles[i + j].low <= candles[i].low) {
        isLow = false;
      }
    }
    
    if (isHigh) {
      swings.push({
        type: 'high',
        index: i,
        price: candles[i].high,
        time: candles[i].time
      });
    }
    if (isLow) {
      swings.push({
        type: 'low',
        index: i,
        price: candles[i].low,
        time: candles[i].time
      });
    }
  }
  
  return swings;
}

function identifyTrendStructure(candles, swings) {
  const recentSwings = swings.slice(-10);
  const highs = recentSwings.filter(s => s.type === 'high');
  const lows = recentSwings.filter(s => s.type === 'low');
  
  let higherHighs = 0, lowerHighs = 0, higherLows = 0, lowerLows = 0;
  
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price > highs[i - 1].price) higherHighs++;
    else lowerHighs++;
  }
  
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) higherLows++;
    else lowerLows++;
  }
  
  let trend = 'ranging';
  if (higherHighs > lowerHighs && higherLows > lowerLows) trend = 'uptrend';
  else if (lowerHighs > higherHighs && lowerLows > higherLows) trend = 'downtrend';
  
  return {
    structure: trend,
    higherHighs,
    lowerHighs,
    higherLows,
    lowerLows,
    recentHigh: highs.length > 0 ? highs[highs.length - 1].price : null,
    recentLow: lows.length > 0 ? lows[lows.length - 1].price : null
  };
}

function identifySupportResistance(swings, currentPrice, atr) {
  const levels = [];
  const tolerance = atr * 0.5;
  
  const allPrices = swings.map(s => s.price);
  const clusters = [];
  
  for (let i = 0; i < allPrices.length; i++) {
    let found = false;
    for (let cluster of clusters) {
      if (Math.abs(allPrices[i] - cluster.price) < tolerance) {
        cluster.touches++;
        cluster.price = (cluster.price * (cluster.touches - 1) + allPrices[i]) / cluster.touches;
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push({ price: allPrices[i], touches: 1 });
    }
  }
  
  for (let cluster of clusters.filter(c => c.touches >= 2)) {
    const distance = Math.abs(currentPrice - cluster.price);
    const type = cluster.price > currentPrice ? 'resistance' : 'support';
    
    levels.push({
      type,
      price: cluster.price,
      strength: cluster.touches,
      distance,
      distanceATR: distance / atr
    });
  }
  
  return levels.sort((a, b) => a.distance - b.distance).slice(0, 5);
}

// ============================================
// CANDLESTICK PATTERNS
// ============================================

function identifyCandlePatterns(candles) {
  if (candles.length < 3) return [];
  
  const patterns = [];
  const last3 = candles.slice(-3);
  const [c2, c1, c0] = last3;
  
  const body = (c) => Math.abs(c.close - c.open);
  const isBullish = (c) => c.close > c.open;
  const upperWick = (c) => c.high - Math.max(c.open, c.close);
  const lowerWick = (c) => Math.min(c.open, c.close) - c.low;
  const range = (c) => c.high - c.low;
  
  // Engulfing patterns
  if (isBullish(c0) && !isBullish(c1) && 
      c0.close > c1.open && c0.open < c1.close && 
      body(c0) > body(c1)) {
    patterns.push({ name: 'Bullish Engulfing', strength: 'strong', direction: 'bullish' });
  }
  
  if (!isBullish(c0) && isBullish(c1) && 
      c0.close < c1.open && c0.open > c1.close && 
      body(c0) > body(c1)) {
    patterns.push({ name: 'Bearish Engulfing', strength: 'strong', direction: 'bearish' });
  }
  
  // Hammer / Shooting Star
  if (lowerWick(c0) > body(c0) * 2 && upperWick(c0) < body(c0) * 0.5) {
    patterns.push({ 
      name: isBullish(c0) ? 'Hammer' : 'Hanging Man', 
      strength: 'moderate', 
      direction: 'bullish' 
    });
  }
  
  if (upperWick(c0) > body(c0) * 2 && lowerWick(c0) < body(c0) * 0.5) {
    patterns.push({ 
      name: 'Shooting Star', 
      strength: 'moderate', 
      direction: 'bearish' 
    });
  }
  
  // Morning Star / Evening Star
  if (!isBullish(c2) && body(c1) < body(c2) * 0.5 && isBullish(c0) && 
      c0.close > (c2.open + c2.close) / 2) {
    patterns.push({ name: 'Morning Star', strength: 'strong', direction: 'bullish' });
  }
  
  if (isBullish(c2) && body(c1) < body(c2) * 0.5 && !isBullish(c0) && 
      c0.close < (c2.open + c2.close) / 2) {
    patterns.push({ name: 'Evening Star', strength: 'strong', direction: 'bearish' });
  }
  
  // Doji
  if (body(c0) < range(c0) * 0.1) {
    patterns.push({ name: 'Doji', strength: 'weak', direction: 'neutral' });
  }
  
  return patterns;
}

// ============================================
// COMPREHENSIVE ANALYSIS
// ============================================

function performCompleteAnalysis(h4Data, dailyData, pairName) {
  const analysis = {
    pair: pairName,
    timestamp: new Date().toISOString(),
    
    current: {
      price: h4Data[h4Data.length - 1].close,
      time: h4Data[h4Data.length - 1].time,
      candle: {
        open: h4Data[h4Data.length - 1].open,
        high: h4Data[h4Data.length - 1].high,
        low: h4Data[h4Data.length - 1].low,
        close: h4Data[h4Data.length - 1].close,
        isBullish: h4Data[h4Data.length - 1].close > h4Data[h4Data.length - 1].open
      }
    },
    
    indicators: {},
    structure: {},
    patterns: {},
    timeframes: {}
  };
  
  // Calculate H4 indicators
  const h4Closes = h4Data.map(c => c.close);
  const h4RSI = calculateRSI(h4Data, 14);
  const h4MACD = calculateMACD(h4Data);
  const h4ATR = calculateATR(h4Data, 14);
  const h4BB = calculateBollingerBands(h4Data, 20, 2);
  const h4Stoch = calculateStochastic(h4Data, 14, 3, 3);
  const h4ADX = calculateADX(h4Data, 14);
  const h4EMA20 = calculateEMA(h4Closes, 20);
  const h4EMA50 = calculateEMA(h4Closes, 50);
  const h4EMA200 = calculateEMA(h4Closes, 200);
  
  analysis.indicators.h4 = {
    rsi: {
      current: h4RSI[h4RSI.length - 1],
      previous: h4RSI[h4RSI.length - 2],
      status: h4RSI[h4RSI.length - 1] > 70 ? 'overbought' : 
              h4RSI[h4RSI.length - 1] < 30 ? 'oversold' : 'neutral',
      trending: h4RSI[h4RSI.length - 1] > h4RSI[h4RSI.length - 2] ? 'rising' : 'falling'
    },
    macd: {
      value: h4MACD.macd[h4MACD.macd.length - 1],
      signal: h4MACD.signal[h4MACD.signal.length - 1],
      histogram: h4MACD.histogram[h4MACD.histogram.length - 1],
      histogramPrev: h4MACD.histogram[h4MACD.histogram.length - 2],
      crossover: (h4MACD.histogram[h4MACD.histogram.length - 2] < 0 && 
                  h4MACD.histogram[h4MACD.histogram.length - 1] > 0) ? 'bullish' :
                 (h4MACD.histogram[h4MACD.histogram.length - 2] > 0 && 
                  h4MACD.histogram[h4MACD.histogram.length - 1] < 0) ? 'bearish' : 'none',
      trending: h4MACD.histogram[h4MACD.histogram.length - 1] > 
                h4MACD.histogram[h4MACD.histogram.length - 2] ? 'strengthening' : 'weakening'
    },
    atr: {
      current: h4ATR.current,
      percentOfPrice: (h4ATR.current / analysis.current.price) * 100
    },
    bollingerBands: {
      upper: h4BB.upper[h4BB.upper.length - 1],
      middle: h4BB.middle[h4BB.middle.length - 1],
      lower: h4BB.lower[h4BB.lower.length - 1],
      width: h4BB.upper[h4BB.upper.length - 1] - h4BB.lower[h4BB.lower.length - 1],
      position: ((analysis.current.price - h4BB.lower[h4BB.lower.length - 1]) / 
                 (h4BB.upper[h4BB.upper.length - 1] - h4BB.lower[h4BB.lower.length - 1]) * 100),
      squeeze: (h4BB.upper[h4BB.upper.length - 1] - h4BB.lower[h4BB.lower.length - 1]) < h4ATR.current * 2
    },
    stochastic: {
      k: h4Stoch.k[h4Stoch.k.length - 1],
      d: h4Stoch.d[h4Stoch.d.length - 1],
      status: h4Stoch.k[h4Stoch.k.length - 1] > 80 ? 'overbought' :
              h4Stoch.k[h4Stoch.k.length - 1] < 20 ? 'oversold' : 'neutral',
      crossover: (h4Stoch.k[h4Stoch.k.length - 2] < h4Stoch.d[h4Stoch.d.length - 2] &&
                  h4Stoch.k[h4Stoch.k.length - 1] > h4Stoch.d[h4Stoch.d.length - 1]) ? 'bullish' :
                 (h4Stoch.k[h4Stoch.k.length - 2] > h4Stoch.d[h4Stoch.d.length - 2] &&
                  h4Stoch.k[h4Stoch.k.length - 1] < h4Stoch.d[h4Stoch.d.length - 1]) ? 'bearish' : 'none'
    },
    adx: {
      value: h4ADX.adx,
      plusDI: h4ADX.plusDI,
      minusDI: h4ADX.minusDI,
      strength: h4ADX.adx > 25 ? 'strong' : h4ADX.adx > 20 ? 'moderate' : 'weak',
      direction: h4ADX.plusDI > h4ADX.minusDI ? 'bullish' : 'bearish'
    },
    ema: {
      ema20: h4EMA20[h4EMA20.length - 1],
      ema50: h4EMA50[h4EMA50.length - 1],
      ema200: h4EMA200.length > 0 ? h4EMA200[h4EMA200.length - 1] : null,
      priceVsEMA20: analysis.current.price > h4EMA20[h4EMA20.length - 1] ? 'above' : 'below',
      priceVsEMA50: analysis.current.price > h4EMA50[h4EMA50.length - 1] ? 'above' : 'below',
      emaAlignment: h4EMA20[h4EMA20.length - 1] > h4EMA50[h4EMA50.length - 1] ? 'bullish' : 'bearish'
    }
  };
  
  // Daily indicators
  if (dailyData && dailyData.length >= 50) {
    const dailyCloses = dailyData.map(c => c.close);
    const dailyRSI = calculateRSI(dailyData, 14);
    const dailyMACD = calculateMACD(dailyData);
    const dailyADX = calculateADX(dailyData, 14);
    const dailyEMA20 = calculateEMA(dailyCloses, 20);
    const dailyEMA50 = calculateEMA(dailyCloses, 50);
    
    analysis.indicators.daily = {
      rsi: {
        current: dailyRSI[dailyRSI.length - 1],
        status: dailyRSI[dailyRSI.length - 1] > 70 ? 'overbought' : 
                dailyRSI[dailyRSI.length - 1] < 30 ? 'oversold' : 'neutral'
      },
      macd: {
        histogram: dailyMACD.histogram[dailyMACD.histogram.length - 1],
        trending: dailyMACD.histogram[dailyMACD.histogram.length - 1] > 
                  dailyMACD.histogram[dailyMACD.histogram.length - 2] ? 'strengthening' : 'weakening'
      },
      adx: {
        value: dailyADX.adx,
        strength: dailyADX.adx > 25 ? 'strong' : dailyADX.adx > 20 ? 'moderate' : 'weak',
        direction: dailyADX.plusDI > dailyADX.minusDI ? 'bullish' : 'bearish'
      },
      ema: {
        ema20: dailyEMA20[dailyEMA20.length - 1],
        ema50: dailyEMA50[dailyEMA50.length - 1],
        priceVsEMA20: analysis.current.price > dailyEMA20[dailyEMA20.length - 1] ? 'above' : 'below',
        emaAlignment: dailyEMA20[dailyEMA20.length - 1] > dailyEMA50[dailyEMA50.length - 1] ? 'bullish' : 'bearish'
      }
    };
  }
  
  // Market Structure
  const h4Swings = identifySwingPoints(h4Data, 5);
  const h4Trend = identifyTrendStructure(h4Data, h4Swings);
  const srLevels = identifySupportResistance(h4Swings, analysis.current.price, h4ATR.current);
  
  analysis.structure = {
    trend: h4Trend.structure,
    trendDetails: {
      higherHighs: h4Trend.higherHighs,
      lowerHighs: h4Trend.lowerHighs,
      higherLows: h4Trend.higherLows,
      lowerLows: h4Trend.lowerLows
    },
    keyLevels: {
      recentHigh: h4Trend.recentHigh,
      recentLow: h4Trend.recentLow,
      supportResistance: srLevels
    },
    swingPoints: h4Swings.slice(-10)
  };
  
  // Pattern Recognition
  const candlePatterns = identifyCandlePatterns(h4Data);
  
  analysis.patterns = {
    candlestick: candlePatterns,
    recentPriceAction: {
      last5Candles: h4Data.slice(-5).map(c => ({
        time: c.time,
        direction: c.close > c.open ? 'bullish' : 'bearish',
        size: Math.abs(c.close - c.open),
        range: c.high - c.low
      })),
      momentum: h4Data.slice(-5).filter(c => c.close > c.open).length >= 4 ? 'strong bullish' :
                h4Data.slice(-5).filter(c => c.close < c.open).length >= 4 ? 'strong bearish' : 'mixed'
    }
  };
  
  // Multi-timeframe alignment
  analysis.timeframes = {
    h4Bias: analysis.indicators.h4.ema.emaAlignment,
    dailyBias: analysis.indicators.daily ? analysis.indicators.daily.ema.emaAlignment : 'unknown',
    aligned: analysis.indicators.daily ? 
             (analysis.indicators.h4.ema.emaAlignment === analysis.indicators.daily.ema.emaAlignment) : false
  };
  
  return analysis;
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('='.repeat(50));
  console.log('FOREX TECHNICAL ANALYSIS SCRIPT');
  console.log('='.repeat(50));
  console.log(`Analyzing ${CONFIG.pairs.length} pairs...`);
  console.log('');
  
  // Fetch all data
  const rawData = await fetchAllData(CONFIG.pairs);
  
  // Analyze each pair
  const results = [];
  
  for (const item of rawData) {
    try {
      console.log(`Analyzing ${item.pair}...`);
      
      if (!item.h4 || item.h4.length < 50) {
        console.log(`  ⚠️  Insufficient H4 data (${item.h4.length} candles)`);
        results.push({
          pair: item.pair,
          error: "Insufficient H4 data",
          dataPoints: item.h4.length
        });
        continue;
      }
      
      const h4Data = normalize(item.h4);
      const dailyData = item.daily.length > 0 ? normalize(item.daily) : null;
      
      const analysis = performCompleteAnalysis(h4Data, dailyData, item.pair);
      
      results.push(analysis);
      console.log(`  ✓ Analysis complete`);
      
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
      results.push({
        pair: item.pair,
        error: e.message,
        stack: e.stack
      });
    }
  }
  
  console.log('');
  console.log('='.repeat(50));
  console.log(`Analysis complete for ${results.length} pairs`);
  console.log('='.repeat(50));
  
  return results;
}

// Run the script
if (typeof module !== 'undefined' && require.main === module) {
  // Node.js environment
  main().then(results => {
    console.log(JSON.stringify(results, null, 2));
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
} else if (typeof window !== 'undefined') {
  // Browser environment
  console.log('Use main() to run analysis');
}

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { main, CONFIG, API_KEYS };
}