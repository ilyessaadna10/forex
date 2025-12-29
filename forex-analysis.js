// ============================================
// ENHANCED FOREX ANALYSIS - LEADING + LAGGING INDICATORS
// Solves lagging indicator problem with price action, momentum, and structure
// ============================================



const API_KEYS = {
  daily: process.env.TWELVEDATA_API_KEY_DAILY,
  h4: process.env.TWELVEDATA_API_KEY_H4
};

const CONFIG = {
  pairs: [
    'EUR/USD', 'GBP/JPY', 'USD/JPY', 'AUD/USD', 
    'AUD/CHF', 'EUR/GBP', 'CAD/JPY', 'AUD/JPY'
  ],
  intervals: {
    daily: { interval: '1day', outputsize: 100 },
    h4: { interval: '4h', outputsize: 200 }
  },
  apiDelay: 1000
};

// ============================================
// LEADING INDICATORS (Price Action Based)
// ============================================

// 1. ORDER FLOW ANALYSIS - Detects institutional buying/selling
function analyzeOrderFlow(candles, lookback = 20) {
  const recent = candles.slice(-lookback);
  
  let buyingPressure = 0;
  let sellingPressure = 0;
  
  recent.forEach(c => {
    const bodySize = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyRatio = bodySize / range;
    
    // Strong bullish candle = buying pressure
    if (c.close > c.open && bodyRatio > 0.6) {
      buyingPressure += bodySize;
    }
    // Strong bearish candle = selling pressure
    else if (c.close < c.open && bodyRatio > 0.6) {
      sellingPressure += bodySize;
    }
  });
  
  const netPressure = buyingPressure - sellingPressure;
  const totalPressure = buyingPressure + sellingPressure;
  const pressureRatio = totalPressure > 0 ? netPressure / totalPressure : 0;
  
  return {
    buying: buyingPressure,
    selling: sellingPressure,
    net: netPressure,
    bias: pressureRatio > 0.3 ? 'bullish' : pressureRatio < -0.3 ? 'bearish' : 'neutral',
    strength: Math.abs(pressureRatio),
    signal: pressureRatio > 0.5 ? 'strong_buy' : pressureRatio < -0.5 ? 'strong_sell' : 'neutral'
  };
}

// 2. MOMENTUM SHIFT DETECTION - Catches trend changes early
function detectMomentumShift(candles, rsi) {
  const last10 = candles.slice(-10);
  const last5 = candles.slice(-5);
  
  // Price momentum
  const priceChange5 = last5[last5.length - 1].close - last5[0].close;
  const priceChange10 = last10[last10.length - 1].close - last10[0].close;
  
  // Candle body sizes (momentum strength)
  const avgBody10 = last10.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 10;
  const avgBody5 = last5.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 5;
  const bodyAcceleration = avgBody5 / avgBody10;
  
  // RSI momentum
  const rsiLast = rsi.slice(-5);
  const rsiRising = rsiLast.filter((v, i) => i > 0 && v > rsiLast[i - 1]).length >= 3;
  const rsiFalling = rsiLast.filter((v, i) => i > 0 && v < rsiLast[i - 1]).length >= 3;
  
  // Divergence detection (leading signal)
  const priceHigher = last5[last5.length - 1].high > last5[0].high;
  const priceLower = last5[last5.length - 1].low < last5[0].low;
  const rsiHigher = rsiLast[rsiLast.length - 1] > rsiLast[0];
  const rsiLower = rsiLast[rsiLast.length - 1] < rsiLast[0];
  
  const bullishDivergence = priceLower && rsiHigher;
  const bearishDivergence = priceHigher && rsiLower;
  
  return {
    acceleration: bodyAcceleration,
    accelerating: bodyAcceleration > 1.2,
    decelerating: bodyAcceleration < 0.8,
    momentum5Candles: priceChange5 > 0 ? 'bullish' : 'bearish',
    momentum10Candles: priceChange10 > 0 ? 'bullish' : 'bearish',
    rsiMomentum: rsiRising ? 'rising' : rsiFalling ? 'falling' : 'flat',
    divergence: bullishDivergence ? 'bullish' : bearishDivergence ? 'bearish' : 'none',
    earlySignal: bullishDivergence || bearishDivergence
  };
}

// 3. PRICE ACTION STRENGTH - Real-time momentum
function analyzePriceActionStrength(candles, lookback = 20) {
  const recent = candles.slice(-lookback);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Current candle characteristics
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const bodyRatio = body / range;
  const isBullish = last.close > last.open;
  
  // Average candle size (context)
  const avgBody = recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / lookback;
  const avgRange = recent.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback;
  
  // Rejection wicks (support/resistance testing)
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperRejection = upperWick > body * 1.5;
  const lowerRejection = lowerWick > body * 1.5;
  
  // Consecutive candles in same direction
  let consecutiveBull = 0, consecutiveBear = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].close > recent[i].open) {
      if (consecutiveBear === 0) consecutiveBull++;
      else break;
    } else {
      if (consecutiveBull === 0) consecutiveBear++;
      else break;
    }
  }
  
  return {
    currentBody: body,
    avgBody: avgBody,
    strength: body / avgBody, // >1.5 = strong momentum
    bodyRatio: bodyRatio, // >0.7 = conviction
    upperRejection: upperRejection,
    lowerRejection: lowerRejection,
    consecutiveBullish: consecutiveBull,
    consecutiveBearish: consecutiveBear,
    momentum: consecutiveBull >= 3 ? 'strong_bullish' : 
              consecutiveBear >= 3 ? 'strong_bearish' : 'neutral',
    signal: lowerRejection && isBullish && body > avgBody ? 'bullish_reversal' :
            upperRejection && !isBullish && body > avgBody ? 'bearish_reversal' : 'none'
  };
}

// 4. SUPPORT/RESISTANCE STRENGTH with Price Approaching
function analyzeLevelStrength(candles, swings, currentPrice, atr) {
  const levels = identifySupportResistance(swings, currentPrice, atr);
  
  // Find nearest level
  const nearest = levels.length > 0 ? levels[0] : null;
  
  if (!nearest) {
    return {
      nearLevel: false,
      distance: null,
      strength: 0,
      type: null,
      priceAction: null
    };
  }
  
  // Check if price is approaching or at the level
  const distanceATR = Math.abs(currentPrice - nearest.price) / atr;
  const approaching = distanceATR < 0.5; // Within 0.5 ATR
  const atLevel = distanceATR < 0.2; // Very close
  
  // Check recent price action at this level
  const last5 = candles.slice(-5);
  const testingLevel = last5.some(c => {
    const cRange = c.high - c.low;
    return (nearest.type === 'support' && c.low <= nearest.price + cRange * 0.3) ||
           (nearest.type === 'resistance' && c.high >= nearest.price - cRange * 0.3);
  });
  
  return {
    nearLevel: approaching,
    atLevel: atLevel,
    distance: Math.abs(currentPrice - nearest.price),
    distanceATR: distanceATR,
    strength: nearest.strength,
    type: nearest.type,
    price: nearest.price,
    testing: testingLevel,
    signal: atLevel && nearest.type === 'support' ? 'potential_bounce' :
            atLevel && nearest.type === 'resistance' ? 'potential_rejection' : 'none'
  };
}

// 5. LIQUIDITY ZONES - Where big orders cluster
function identifyLiquidityZones(candles, atr) {
  const zones = [];
  const lookback = Math.min(50, candles.length);
  const recent = candles.slice(-lookback);
  
  // Find where price stalled or reversed sharply
  for (let i = 1; i < recent.length - 1; i++) {
    const curr = recent[i];
    const prev = recent[i - 1];
    const next = recent[i + 1];
    
    // Sharp reversal candle
    const sharpReversalUp = prev.close < prev.open && curr.close > curr.open && 
                            Math.abs(curr.close - curr.open) > atr * 0.5;
    const sharpReversalDown = prev.close > prev.open && curr.close < curr.open && 
                              Math.abs(curr.close - curr.open) > atr * 0.5;
    
    if (sharpReversalUp || sharpReversalDown) {
      zones.push({
        price: sharpReversalUp ? curr.low : curr.high,
        type: sharpReversalUp ? 'demand' : 'supply',
        strength: Math.abs(curr.close - curr.open) / atr,
        time: curr.time
      });
    }
  }
  
  // Consolidation zones (liquidity builds up)
  const tolerance = atr * 0.3;
  const consolidations = [];
  
  for (let i = 5; i < recent.length; i++) {
    const slice = recent.slice(i - 5, i);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    
    if (high - low < atr * 1.5) { // Tight range = consolidation
      consolidations.push({
        price: (high + low) / 2,
        type: 'consolidation',
        strength: 5,
        range: high - low
      });
    }
  }
  
  return {
    reversalZones: zones.slice(-5),
    consolidations: consolidations.slice(-3),
    hasNearbyZone: zones.some(z => Math.abs(z.price - candles[candles.length - 1].close) < atr * 0.5)
  };
}

// ============================================
// EXISTING FUNCTIONS (Keep all your original functions)
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
    
    const [h4Data, dailyData] = await Promise.all([
      fetchData(pair, '4h', API_KEYS.h4),
      fetchData(pair, '1day', API_KEYS.daily)
    ]);
    
    results.push({
      pair,
      h4: h4Data,
      daily: dailyData
    });
    
    await delay(CONFIG.apiDelay);
  }
  
  return results;
}

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
// ENHANCED ANALYSIS WITH LEADING INDICATORS
// ============================================

function performEnhancedAnalysis(h4Data, dailyData, pairName) {
  // Get basic indicators first
  const h4RSI = calculateRSI(h4Data, 14);
  const h4MACD = calculateMACD(h4Data);
  const h4ATR = calculateATR(h4Data, 14);
  const h4ADX = calculateADX(h4Data, 14);
  const h4Closes = h4Data.map(c => c.close);
  const h4EMA20 = calculateEMA(h4Closes, 20);
  const h4EMA50 = calculateEMA(h4Closes, 50);
  
  const currentPrice = h4Data[h4Data.length - 1].close;
  const h4Swings = identifySwingPoints(h4Data, 5);
  const h4Trend = identifyTrendStructure(h4Data, h4Swings);
  
  // NEW: LEADING INDICATORS
  const orderFlow = analyzeOrderFlow(h4Data, 20);
  const momentumShift = detectMomentumShift(h4Data, h4RSI);
  const priceAction = analyzePriceActionStrength(h4Data, 20);
  const levelStrength = analyzeLevelStrength(h4Data, h4Swings, currentPrice, h4ATR.current);
  const liquidity = identifyLiquidityZones(h4Data, h4ATR.current);
  
  // COMPOSITE SIGNAL GENERATION
  const signals = {
    // Leading signals (early entry)
    orderFlowSignal: orderFlow.signal,
    momentumShiftSignal: momentumShift.earlySignal ? 
      (momentumShift.divergence === 'bullish' ? 'early_buy' : 'early_sell') : 'none',
    priceActionSignal: priceAction.signal,
    levelApproach: levelStrength.signal,
    
    // Confirmation signals (reduce risk)
    trendAlignment: h4Trend.structure === 'uptrend' ? 'bullish' : 
                    h4Trend.structure === 'downtrend' ? 'bearish' : 'neutral',
    rsiConfirmation: h4RSI[h4RSI.length - 1] < 35 ? 'oversold_buy' :
                     h4RSI[h4RSI.length - 1] > 65 ? 'overbought_sell' : 'neutral',
    macdConfirmation: h4MACD.histogram[h4MACD.histogram.length - 1] > 0 ? 'bullish' : 'bearish'
  };
  
  // ENTRY TIMING SCORE (0-100)
  let entryScore = 50; // Neutral starting point
  
  // Leading indicators (add points for early entry)
  if (orderFlow.bias === 'bullish') entryScore += 10;
  if (orderFlow.bias === 'bearish') entryScore -= 10;
  if (momentumShift.divergence === 'bullish') entryScore += 15; // Strong leading signal
  if (momentumShift.divergence === 'bearish') entryScore -= 15;
  if (priceAction.signal === 'bullish_reversal') entryScore += 12;
  if (priceAction.signal === 'bearish_reversal') entryScore -= 12;
  if (levelStrength.signal === 'potential_bounce') entryScore += 10;
  if (levelStrength.signal === 'potential_rejection') entryScore -= 10;
  
  // Confirmation (validate the early signal)
  if (h4Trend.structure === 'uptrend') entryScore += 8;
  if (h4Trend.structure === 'downtrend') entryScore -= 8;
  if (h4RSI[h4RSI.length - 1] < 30) entryScore += 8; // Oversold in uptrend = buy
  if (h4RSI[h4RSI.length - 1] > 70) entryScore -= 8;
  if (h4MACD.histogram[h4MACD.histogram.length - 1] > h4MACD.histogram[h4MACD.histogram.length - 2]) entryScore += 5;
  else entryScore -= 5;
  
  // Risk factors (reduce score)
  if (h4ADX.adx < 15) entryScore -= 10; // Ranging market
  if (!levelStrength.nearLevel && !liquidity.hasNearbyZone) entryScore -= 15; // No clear level
  
  const analysis = {
    pair: pairName,
    timestamp: new Date().toISOString(),
    
    current: {
      price: currentPrice,
      time: h4Data[h4Data.length - 1].time
    },
    
    // LEADING INDICATORS (Main focus)
    leadingIndicators: {
      orderFlow: orderFlow,
      momentumShift: momentumShift,
      priceAction: priceAction,
      levelStrength: levelStrength,
      liquidityZones: liquidity
    },
    
    // LAGGING INDICATORS (Confirmation only)
    laggingIndicators: {
      rsi: {
        current: h4RSI[h4RSI.length - 1],
        status: h4RSI[h4RSI.length - 1] > 70 ? 'overbought' : 
                h4RSI[h4RSI.length - 1] < 30 ? 'oversold' : 'neutral'
      },
      macd: {
        histogram: h4MACD.histogram[h4MACD.histogram.length - 1],
        trending: h4MACD.histogram[h4MACD.histogram.length - 1] > 
                  h4MACD.histogram[h4MACD.histogram.length - 2] ? 'up' : 'down'
      },
      adx: {
        value: h4ADX.adx,
        strength: h4ADX.adx > 25 ? 'strong' : h4ADX.adx > 15 ? 'moderate' : 'weak'
      },
      ema: {
        ema20: h4EMA20[h4EMA20.length - 1],
        ema50: h4EMA50[h4EMA50.length - 1],
        alignment: h4EMA20[h4EMA20.length - 1] > h4EMA50[h4EMA50.length - 1] ? 'bullish' : 'bearish'
      }
    },
    
    structure: {
      trend: h4Trend.structure,
      recentHigh: h4Trend.recentHigh,
      recentLow: h4Trend.recentLow
    },
    
    // TRADING DECISION
    tradingSignal: {
      entryScore: Math.round(entryScore),
      bias: entryScore > 60 ? 'BULLISH' : entryScore < 40 ? 'BEARISH' : 'NEUTRAL',
      strength: entryScore > 70 || entryScore < 30 ? 'STRONG' : 
                entryScore > 60 || entryScore < 40 ? 'MODERATE' : 'WEAK',
      recommendation: entryScore > 65 ? 'BUY' : 
                      entryScore < 35 ? 'SELL' : 'WAIT',
      confidence: Math.abs(entryScore - 50) / 50 * 100, // 0-100%
      
      entryType: levelStrength.atLevel ? 'IMMEDIATE' : 
                 levelStrength.nearLevel ? 'WAIT_FOR_LEVEL' : 
                 momentumShift.earlySignal ? 'EARLY_ENTRY' : 'WAIT_FOR_SETUP',
      
      reasoning: generateReasoning(signals, orderFlow, momentumShift, priceAction, levelStrength, h4Trend, h4ADX)
    },
    
    // KEY LEVELS
    keyLevels: {
      support: levelStrength.type === 'support' ? levelStrength.price : null,
      resistance: levelStrength.type === 'resistance' ? levelStrength.price : null,
      nearestLevel: levelStrength.price,
      atr: h4ATR.current
    }
  };
  
  return analysis;
}

function generateReasoning(signals, orderFlow, momentumShift, priceAction, levelStrength, trend, adx) {
  const reasons = [];
  
  // Leading indicator signals
  if (orderFlow.signal === 'strong_buy') {
    reasons.push(`Strong buying pressure detected (${(orderFlow.strength * 100).toFixed(0)}% dominance)`);
  } else if (orderFlow.signal === 'strong_sell') {
    reasons.push(`Strong selling pressure detected (${(orderFlow.strength * 100).toFixed(0)}% dominance)`);
  }
  
  if (momentumShift.divergence === 'bullish') {
    reasons.push('Bullish divergence - price making lower lows but RSI rising (EARLY BUY SIGNAL)');
  } else if (momentumShift.divergence === 'bearish') {
    reasons.push('Bearish divergence - price making higher highs but RSI falling (EARLY SELL SIGNAL)');
  }
  
  if (priceAction.signal === 'bullish_reversal') {
    reasons.push(`Bullish reversal pattern with ${priceAction.strength.toFixed(1)}x average body size`);
  } else if (priceAction.signal === 'bearish_reversal') {
    reasons.push(`Bearish reversal pattern with ${priceAction.strength.toFixed(1)}x average body size`);
  }
  
  if (levelStrength.atLevel) {
    reasons.push(`Price AT ${levelStrength.type} level (${levelStrength.strength} touches) - HIGH PROBABILITY ZONE`);
  } else if (levelStrength.nearLevel) {
    reasons.push(`Price approaching ${levelStrength.type} (${levelStrength.distanceATR.toFixed(2)} ATR away)`);
  }
  
  if (priceAction.consecutiveBullish >= 3) {
    reasons.push(`${priceAction.consecutiveBullish} consecutive bullish candles - strong momentum`);
  } else if (priceAction.consecutiveBearish >= 3) {
    reasons.push(`${priceAction.consecutiveBearish} consecutive bearish candles - strong momentum`);
  }
  
  // Trend confirmation
  if (trend.structure === 'uptrend' && adx.adx > 20) {
    reasons.push(`Clear uptrend structure with ADX ${adx.adx.toFixed(1)} (confirmed trend)`);
  } else if (trend.structure === 'downtrend' && adx.adx > 20) {
    reasons.push(`Clear downtrend structure with ADX ${adx.adx.toFixed(1)} (confirmed trend)`);
  }
  
  if (momentumShift.accelerating) {
    reasons.push(`Momentum accelerating (${momentumShift.acceleration.toFixed(2)}x) - entry timing is critical`);
  }
  
  if (reasons.length === 0) {
    reasons.push('No clear setup - wait for better entry conditions');
  }
  
  return reasons;
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('='.repeat(60));
  console.log('ENHANCED FOREX ANALYSIS - LEADING + LAGGING INDICATORS');
  console.log('Solving Lagging Indicator Problem');
  console.log('='.repeat(60));
  console.log(`Analyzing ${CONFIG.pairs.length} pairs...`);
  console.log('');
  
  const rawData = await fetchAllData(CONFIG.pairs);
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
      
      const analysis = performEnhancedAnalysis(h4Data, dailyData, item.pair);
      
      results.push(analysis);
      
      // Quick summary
      const signal = analysis.tradingSignal;
      console.log(`  ✓ ${signal.recommendation} (Score: ${signal.entryScore}/100, ${signal.strength})`);
      console.log(`    Entry: ${signal.entryType}`);
      if (analysis.leadingIndicators.momentumShift.divergence !== 'none') {
        console.log(`    🔔 ${analysis.leadingIndicators.momentumShift.divergence.toUpperCase()} DIVERGENCE DETECTED!`);
      }
      
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
      results.push({
        pair: item.pair,
        error: e.message
      });
    }
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log(`Analysis complete for ${results.length} pairs`);
  console.log('='.repeat(60));
  console.log('');
  console.log('TRADING SIGNALS SUMMARY:');
  console.log('-'.repeat(60));
  
  const trades = results.filter(r => !r.error && r.tradingSignal.recommendation !== 'WAIT');
  
  if (trades.length === 0) {
    console.log('No trading setups found. Wait for better opportunities.');
  } else {
    trades.sort((a, b) => b.tradingSignal.entryScore - a.tradingSignal.entryScore);
    
    trades.forEach((t, i) => {
      console.log(`${i + 1}. ${t.pair}: ${t.tradingSignal.recommendation} (${t.tradingSignal.entryScore}/100)`);
      console.log(`   Entry Type: ${t.tradingSignal.entryType}`);
      console.log(`   Top Reason: ${t.tradingSignal.reasoning[0]}`);
      console.log('');
    });
  }
  
  return results;
}

// Browser/Node compatibility
if (typeof module !== 'undefined' && require.main === module) {
  main().then(results => {
    console.log(JSON.stringify(results, null, 2));
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
} else if (typeof window !== 'undefined') {
  console.log('Use main() to run analysis');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    main, 
    CONFIG, 
    API_KEYS,
    performEnhancedAnalysis,
    analyzeOrderFlow,
    detectMomentumShift,
    analyzePriceActionStrength
  };
}
