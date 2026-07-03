import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated } from 'react-native';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';

// Create Animated versions of Svg components we want to animate
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TailPoint {
  x: number;
  age: number;
}

interface FrequencyVisualizerProps {
  width: number;
  height: number;
  currentFrequency: number | null;
  targetFrequency: number | null;
  currentVolume: number | null;
  visualizerSensitivity: number;
  // We can add more props for styling, range, etc.
}

const NEON_GREEN = '#39FF14';
const NEON_GREEN_TRANSPARENT = 'rgba(57, 255, 20, 0.6)'; // #39FF14 with 0.6 alpha
const NEON_GREEN_GLOW_COLOR = 'rgba(57, 255, 20, 0.25)'; // For the tail glow

// const CENTS_RANGE = 50; // No longer needed for dot positioning
const MAX_TAIL_POINTS = 150; // Maximum number of points in the indicator's tail.
const TAIL_COLOR = NEON_GREEN_TRANSPARENT;
const TAIL_STROKE_WIDTH = 4; // Stroke width for the tail.
const INDICATOR_RADIUS = 8; // Radius of the main frequency indicator dot.
const TAIL_FALL_SPEED = 1.5; // Speed at which the tail falls (pixels per age unit).
const ANIMATION_TENSION = 30; // Spring animation tension for the indicator.
const ANIMATION_FRICTION = 25; // Spring animation friction for the indicator.
const MIN_VISUALIZATION_VOLUME = -90; // dBFS: Minimum volume for any visual elements to appear.
const INITIAL_SETTLING_DELAY = 150; // ms: Delay to allow transient sounds to settle before showing indicator.

const SMOOTHING_ALPHA = 0.2; // Lower values = more smoothing. E.g., 0.2 means 20% new, 80% previous.

// Constants for the diffuse glow circles effect in the tail.
const GLOW_CIRCLE_INITIAL_OPACITY = 0.15;
const GLOW_CIRCLE_FINAL_OPACITY = 0.0;
const GRID_LINE_COLOR = NEON_GREEN_GLOW_COLOR; // Use existing glow color for grid lines
const GRID_LINE_STROKE_WIDTH = "1";
const GRID_LINE_PROPORTIONS = [0.25, 0.5, 0.75]; // Proportions of half-width for grid lines
const GLOW_CIRCLE_INITIAL_RADIUS = TAIL_STROKE_WIDTH * 0.8;
const GLOW_CIRCLE_MAX_RADIUS_FACTOR = 2;
const MAX_AGE_FOR_GLOW_SCALING = MAX_TAIL_POINTS * 0.6;

// function getCentsDifference(baseFrequency: number, targetFrequency: number): number { // No longer needed
//   if (baseFrequency <= 0 || targetFrequency <= 0) return 0;
//   return 1200 * Math.log2(targetFrequency / baseFrequency);
// }

const FrequencyVisualizer: React.FC<FrequencyVisualizerProps> = ({
  width,
  height,
  currentFrequency,
  targetFrequency,
  currentVolume,
  visualizerSensitivity,
}) => {
  // Initialize Animated.Value with a placeholder (e.g., 0 or initial width/2 if width is immediately available)
  // It will be properly set in useEffect when width is confirmed.
  const animatedIndicatorX = useRef(new Animated.Value(width > 0 ? width / 2 : 0)).current;
  const currentAnimatedX = useRef(width > 0 ? width / 2 : 0); // Tracks the current animated X value
  
  const [rawIndicatorTargetX, setRawIndicatorTargetX] = useState(width > 0 ? width / 2 : 0);
  
  const [tailPoints, setTailPoints] = useState<TailPoint[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const isIndicatorCurrentlyVisible = useRef(false);
  const wasPreviouslyVisible = useRef(false); // To detect transition to visible
  const [isSettling, setIsSettling] = useState(false);
  const settlingTimerRef = useRef<number | null>(null);
  const smoothedFrequencyRef = useRef<number | null>(null);

  // Resets indicator position and state when width changes (e.g., on orientation change).
  useEffect(() => {
    if (width > 0) {
      const initialX = width / 2;
      // Set the target for the spring animation
      setRawIndicatorTargetX(initialX);
      // Stop any ongoing animation and set the Animated.Value directly
      // This ensures the dot visually resets if width changes or on initial setup
      animatedIndicatorX.stopAnimation(() => {
        animatedIndicatorX.setValue(initialX);
        currentAnimatedX.current = initialX; // Sync our manual tracker
      });
      isIndicatorCurrentlyVisible.current = false; 
      wasPreviouslyVisible.current = false;
      setIsSettling(false);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
    } else {
      // Handle case where width might become 0 (e.g., if component unmounts and layout is reset)
      setRawIndicatorTargetX(0);
      animatedIndicatorX.stopAnimation(() => {
        animatedIndicatorX.setValue(0);
        currentAnimatedX.current = 0;
      });
      isIndicatorCurrentlyVisible.current = false;
      wasPreviouslyVisible.current = false;
      setIsSettling(false);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
    }
  }, [width, animatedIndicatorX]); // Only width. animatedIndicatorX is stable due to useRef.

  if (width === 0 || height === 0) {
    return null; // Don't render if dimensions are not yet available
  }

  const centerX = width / 2;
  const centerY = height / 2;

  // Re-attach listener when rawIndicatorTargetX changes
  useEffect(() => {
    const listenerId = animatedIndicatorX.addListener(({ value }) => {
      currentAnimatedX.current = value;
    });
    return () => {
      animatedIndicatorX.removeListener(listenerId);
    };
  }, [animatedIndicatorX, rawIndicatorTargetX]); // Re-run when target changes

  // Effect to calculate and set the target X for the indicator dot
  useEffect(() => {
    if (width === 0 || height === 0) return;

    const centerX = width / 2;
    let newCalculatedTargetX = centerX;
    let nextIndicatorVisibleState = false;

    if (currentVolume !== null && currentVolume >= MIN_VISUALIZATION_VOLUME) {
      if (currentFrequency !== null && targetFrequency !== null) {
        nextIndicatorVisibleState = true; 
      } else {
        // Volume OK, but no valid frequencies
      }
    } else {
      // Volume too low
    }

    if (nextIndicatorVisibleState && !wasPreviouslyVisible.current) {
      setIsSettling(true);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
      settlingTimerRef.current = setTimeout(() => {
        setIsSettling(false);
        settlingTimerRef.current = null;
      }, INITIAL_SETTLING_DELAY);
    } else if (!nextIndicatorVisibleState && wasPreviouslyVisible.current) {
      setIsSettling(false);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
      settlingTimerRef.current = null;
    }
    wasPreviouslyVisible.current = nextIndicatorVisibleState;
    isIndicatorCurrentlyVisible.current = nextIndicatorVisibleState && !isSettling;

    let frequencyToUseForVisuals: number | null = null;
    if (currentFrequency !== null) {
      if (smoothedFrequencyRef.current === null) {
        // No prior smoothed value (first frame after true silence): seed with the
        // current frequency. We deliberately do NOT reseed across the settling
        // transition — the upstream pipeline already delivers a stable stream, so
        // keeping the EMA history here avoids a visible jump when settling ends.
        smoothedFrequencyRef.current = currentFrequency;
      } else {
        smoothedFrequencyRef.current =
          (currentFrequency * SMOOTHING_ALPHA) +
          (smoothedFrequencyRef.current * (1 - SMOOTHING_ALPHA));
      }
      frequencyToUseForVisuals = smoothedFrequencyRef.current;
    } else {
      smoothedFrequencyRef.current = null; // Reset on true silence (null frequency)
      frequencyToUseForVisuals = null;
    }

    if (isIndicatorCurrentlyVisible.current && frequencyToUseForVisuals !== null && targetFrequency !== null) {
      const effectiveSensitivity = Math.max(0.01, visualizerSensitivity);
      const hzDifference = frequencyToUseForVisuals - targetFrequency;

      // Soft saturation (tanh) instead of a hard clamp: the dot eases toward the
      // rail on a large-but-real detuning rather than snapping to it. Stays in
      // (-1, 1); at ±sensitivity Hz the dot sits ~76% of the way out.
      const deviationRatio = Math.tanh(hzDifference / effectiveSensitivity);

      newCalculatedTargetX = centerX + deviationRatio * (width / 2);
    } else {
      // Not visible, or is settling, or frequencies are null: target center
      newCalculatedTargetX = centerX;
    }
    
    setRawIndicatorTargetX(prevRawTargetX => {
      if (Math.abs(newCalculatedTargetX - prevRawTargetX) > 0.01) {
        return newCalculatedTargetX;
      }
      return prevRawTargetX;
    });

  }, [currentFrequency, targetFrequency, currentVolume, width, height, isSettling, visualizerSensitivity]);

  // Effect to animate the indicator dot to the rawIndicatorTargetX
  useEffect(() => {
    if (width === 0) return; 
    
    Animated.spring(animatedIndicatorX, {
      toValue: rawIndicatorTargetX,
      useNativeDriver: false,
      tension: ANIMATION_TENSION,
      friction: ANIMATION_FRICTION,
    }).start();
  }, [rawIndicatorTargetX, animatedIndicatorX, width]);

  const animationLoop = useCallback(() => {
    setTailPoints(prevPoints => {
      let updatedPoints = prevPoints.map(p => ({ ...p, age: p.age + 1 }));
      if (isIndicatorCurrentlyVisible.current) { 
        const newPoint: TailPoint = { x: currentAnimatedX.current, age: 0 };
        updatedPoints = [newPoint, ...updatedPoints];
      }
      const currentCenterY = height / 2;
      const currentHeight = height;

      updatedPoints = updatedPoints
        .filter(p => (currentCenterY + INDICATOR_RADIUS) + (p.age * TAIL_FALL_SPEED) < currentHeight + TAIL_STROKE_WIDTH)
        .slice(0, MAX_TAIL_POINTS);
      return updatedPoints;
    });
    animationFrameId.current = requestAnimationFrame(animationLoop);
  }, [height, rawIndicatorTargetX, isIndicatorCurrentlyVisible, currentAnimatedX]); 

  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(animationLoop);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [animationLoop]);

  return (
    <Svg width={width} height={height}>
      {/* Center Line (Target) */}
      <Line
        x1={centerX}
        y1={0}
        x2={centerX}
        y2={height}
        stroke={NEON_GREEN} // Changed from "blue"
        strokeWidth="2"
      />

      {/* Grid Lines */}
      {GRID_LINE_PROPORTIONS.map((proportion) => {
        const xPositionLeft = centerX - proportion * (width / 2);
        const xPositionRight = centerX + proportion * (width / 2);
        return (
          <React.Fragment key={`grid-${proportion}`}>
            <Line
              x1={xPositionLeft}
              y1={0}
              x2={xPositionLeft}
              y2={height}
              stroke={GRID_LINE_COLOR}
              strokeWidth={GRID_LINE_STROKE_WIDTH}
            />
            <Line
              x1={xPositionRight}
              y1={0}
              x2={xPositionRight}
              y2={height}
              stroke={GRID_LINE_COLOR}
              strokeWidth={GRID_LINE_STROKE_WIDTH}
            />
          </React.Fragment>
        );
      })}

      {/* Render Diffuse Glow Circles (drawn first, so they are underneath the main tail) */}
      {tailPoints.map((point, index) => {
        // Determine scale factor based on age (0 = newest, 1 = oldest effectively for scaling)
        // We want glow to be max radius and min opacity at the oldest parts of the visible tail.
        const ageRatio = Math.min(point.age / MAX_AGE_FOR_GLOW_SCALING, 1);

        const glowRadius = GLOW_CIRCLE_INITIAL_RADIUS + 
                           (TAIL_STROKE_WIDTH * GLOW_CIRCLE_MAX_RADIUS_FACTOR - GLOW_CIRCLE_INITIAL_RADIUS) * ageRatio;
        const glowOpacity = GLOW_CIRCLE_INITIAL_OPACITY - 
                            (GLOW_CIRCLE_INITIAL_OPACITY - GLOW_CIRCLE_FINAL_OPACITY) * ageRatio;

        const pointY = (centerY + INDICATOR_RADIUS) + (point.age * TAIL_FALL_SPEED);

        // Prevent rendering circles that are already too faint or too small (optional optimization)
        if (glowOpacity <= 0.01 || glowRadius <= 0.5) return null;
        
        return (
          <Circle
            key={String(index) + '_glow'}
            cx={point.x}
            cy={pointY}
            r={glowRadius}
            fill={NEON_GREEN} // Solid neon green, opacity controls transparency
            fillOpacity={Math.max(0, glowOpacity)} // Ensure opacity doesn't go negative
          />
        );
      })}

      {/* Render Main Tail Polyline */}
      {tailPoints.length > 1 && (
        <Polyline
          points={tailPoints.map(p => `${p.x},${(centerY + INDICATOR_RADIUS) + (p.age * TAIL_FALL_SPEED)}`).join(' ')}
          fill="none"
          stroke={TAIL_COLOR} 
          strokeWidth={TAIL_STROKE_WIDTH}
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
      )}

      {/* Current Frequency Indicator Dot (Animated) */}
      {isIndicatorCurrentlyVisible.current && (
        <AnimatedCircle
          cx={animatedIndicatorX} // Use animated value
          cy={centerY} 
          r={INDICATOR_RADIUS} 
          fill={NEON_GREEN} // Changed from "red"
        />
      )}
    </Svg>
  );
};

export default FrequencyVisualizer; 