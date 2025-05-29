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
  currentVolume: number | null; // New prop for volume
  // We can add more props for styling, range, etc.
}

const NEON_GREEN = '#39FF14';
const NEON_GREEN_TRANSPARENT = 'rgba(57, 255, 20, 0.6)'; // #39FF14 with 0.6 alpha
const NEON_GREEN_GLOW_COLOR = 'rgba(57, 255, 20, 0.25)'; // For the tail glow

const CENTS_RANGE = 50; // Range in cents (+/-) for visual deviation.
const MAX_TAIL_POINTS = 150; // Maximum number of points in the indicator's tail.
const TAIL_COLOR = NEON_GREEN_TRANSPARENT;
const TAIL_STROKE_WIDTH = 4; // Stroke width for the tail.
const TAIL_GLOW_STROKE_WIDTH = TAIL_STROKE_WIDTH + 8; // Stroke width for the tail's glow effect.
const INDICATOR_RADIUS = 8; // Radius of the main frequency indicator dot.
const TAIL_FALL_SPEED = 1.5; // Speed at which the tail falls (pixels per age unit).
const ANIMATION_TENSION = 40; // Spring animation tension for the indicator.
const ANIMATION_FRICTION = 15; // Spring animation friction for the indicator.
const FREQUENCY_THRESHOLD = 0.1; // Hz: Minimum change in frequency to trigger an update.
const MIN_VISUALIZATION_VOLUME = -90; // dBFS: Minimum volume for the visualizer to display elements.
const INITIAL_SETTLING_DELAY = 75; // ms: Delay to allow transient sounds to settle before showing indicator.

// Constants for the diffuse glow circles effect in the tail.
const GLOW_CIRCLE_INITIAL_OPACITY = 0.15;
const GLOW_CIRCLE_FINAL_OPACITY = 0.0;
const GLOW_CIRCLE_INITIAL_RADIUS = TAIL_STROKE_WIDTH * 0.8;
const GLOW_CIRCLE_MAX_RADIUS_FACTOR = 2;
const MAX_AGE_FOR_GLOW_SCALING = MAX_TAIL_POINTS * 0.6;

// Helper function to convert frequency difference to cents
function getCentsDifference(baseFrequency: number, targetFrequency: number): number {
  if (baseFrequency <= 0 || targetFrequency <= 0) return 0;
  return 1200 * Math.log2(targetFrequency / baseFrequency);
}

const FrequencyVisualizer: React.FC<FrequencyVisualizerProps> = ({
  width,
  height,
  currentFrequency,
  targetFrequency,
  currentVolume, // Destructure new prop
}) => {
  // Initialize Animated.Value with a placeholder (e.g., 0 or initial width/2 if width is immediately available)
  // It will be properly set in useEffect when width is confirmed.
  const animatedIndicatorX = useRef(new Animated.Value(width > 0 ? width / 2 : 0)).current;
  const currentAnimatedX = useRef(width > 0 ? width / 2 : 0); // Tracks the current animated X value
  
  const [rawIndicatorTargetX, setRawIndicatorTargetX] = useState(width > 0 ? width / 2 : 0);
  const displayedFrequencyRef = useRef<number | null>(null); // Stores the frequency for 0.1Hz threshold
  
  const [tailPoints, setTailPoints] = useState<TailPoint[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const isIndicatorCurrentlyVisible = useRef(false);
  const wasPreviouslyVisible = useRef(false); // To detect transition to visible
  const [isSettling, setIsSettling] = useState(false);
  const settlingTimerRef = useRef<number | null>(null);

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
      displayedFrequencyRef.current = null;
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
      displayedFrequencyRef.current = null;
      isIndicatorCurrentlyVisible.current = false;
      wasPreviouslyVisible.current = false;
      setIsSettling(false);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
    }
  }, [width]); // Only width. animatedIndicatorX is stable due to useRef.

  if (width === 0 || height === 0) {
    return null; // Don't render if dimensions are not yet available
  }

  const centerX = width / 2;
  const centerY = height / 2;

  // Re-attach listener when rawIndicatorTargetX changes
  useEffect(() => {
    // console.log(`Attaching listener. TargetX: ${rawIndicatorTargetX.toFixed(2)}`);
    const listenerId = animatedIndicatorX.addListener(({ value }) => {
      // console.log(`Listener: currentAnimatedX.current = ${value.toFixed(2)}`);
      currentAnimatedX.current = value;
    });
    return () => {
    //   console.log(`Removing listener. Old TargetX: ${rawIndicatorTargetX.toFixed(2)}`);
      animatedIndicatorX.removeListener(listenerId);
    };
  }, [animatedIndicatorX, rawIndicatorTargetX]); // Re-run when target changes

  // Effect to calculate and set the target X for the indicator dot based on 0.1Hz frequency threshold
  useEffect(() => {
    if (width === 0 || height === 0) return;

    let newCalculatedTargetX = centerX;
    let nextIndicatorVisibleState = false; // Calculate next state before setting ref

    // Determine base visibility based on volume and valid frequencies.
    if (currentVolume !== null && currentVolume >= MIN_VISUALIZATION_VOLUME) {
      if (currentFrequency !== null && targetFrequency !== null) {
        nextIndicatorVisibleState = true; 
      } else {
        // Volume OK, but no valid frequencies
        displayedFrequencyRef.current = null;
        // nextIndicatorVisibleState remains false
      }
    } else {
      // Volume too low
      displayedFrequencyRef.current = null;
      // nextIndicatorVisibleState remains false
    }

    // Handle settling delay when indicator becomes visible
    if (nextIndicatorVisibleState && !wasPreviouslyVisible.current) {
      setIsSettling(true);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current); // Clear any existing
      settlingTimerRef.current = setTimeout(() => {
        setIsSettling(false);
        settlingTimerRef.current = null;
      }, INITIAL_SETTLING_DELAY);
    } else if (!nextIndicatorVisibleState && wasPreviouslyVisible.current) {
      // Became not visible, clear settling state and timer immediately
      setIsSettling(false);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
      settlingTimerRef.current = null;
    }
    wasPreviouslyVisible.current = nextIndicatorVisibleState;
    isIndicatorCurrentlyVisible.current = nextIndicatorVisibleState && !isSettling;

    // Actual frequency processing for dot position, only if not settling and visible
    if (nextIndicatorVisibleState && !isSettling) {
        let freqToUseForCalc = displayedFrequencyRef.current;
        // This check should ideally use currentFrequency from props, not displayedFrequencyRef for the THRESHOLD check
        // when deciding *whether to update* displayedFrequencyRef.
        if (displayedFrequencyRef.current === null || 
            (currentFrequency !== null && Math.abs(currentFrequency - displayedFrequencyRef.current) >= FREQUENCY_THRESHOLD)) {
          if (currentFrequency !== null) displayedFrequencyRef.current = currentFrequency;
          freqToUseForCalc = currentFrequency; // Use the live current frequency if it passed threshold or ref was null
        }
        // If after thresholding, freqToUseForCalc is still null (e.g. currentFrequency was null but we passed volume check)
        // then we should not proceed to calculate position with it.
        if (freqToUseForCalc !== null && targetFrequency !== null) { // Ensure targetFrequency is also not null
          const centsDiff = getCentsDifference(targetFrequency, freqToUseForCalc);
          const deviationRatio = Math.max(-1, Math.min(1, centsDiff / CENTS_RANGE));
          newCalculatedTargetX = centerX + deviationRatio * (width / 2); 
        } else {
          // Freq to use for calc is null, or target is null. Stay centered.
          isIndicatorCurrentlyVisible.current = false; // Override visibility if no valid freq for calc
          newCalculatedTargetX = centerX;
        }
    } else {
        // Not visible or is settling, target center
        // If it became not visible, displayedFrequencyRef is already nulled by volume/freq check block
        // If just settling, we don't want to null displayedFrequencyRef here, as it holds the pre-settling target
        newCalculatedTargetX = centerX;
    }
    
    if (Math.abs(newCalculatedTargetX - rawIndicatorTargetX) > 0.01) {
      setRawIndicatorTargetX(newCalculatedTargetX);
    }
  // Added isSettling to deps, as it influences logic flow here.
  }, [currentFrequency, targetFrequency, currentVolume, width, height, rawIndicatorTargetX, CENTS_RANGE, centerX, isSettling]);

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
    // console.log(`AnimationLoop: isIndicatorCurrentlyVisible.current: ${isIndicatorCurrentlyVisible.current}, currentAnimatedX: ${currentAnimatedX.current.toFixed(2)}`);
    setTailPoints(prevPoints => {
      let updatedPoints = prevPoints.map(p => ({ ...p, age: p.age + 1 }));
      if (isIndicatorCurrentlyVisible.current) { 
        // console.log(`Adding tail point at X: ${currentAnimatedX.current.toFixed(2)}`);
        const newPoint: TailPoint = { x: currentAnimatedX.current, age: 0 };
        updatedPoints = [newPoint, ...updatedPoints];
      }
      // Use local centerY and height from the outer scope, which are fresh each render the callback might be defined in.
      // However, this callback is meant to be stable based on its deps.
      // Let's ensure it uses the `centerY` and `height` captured when it was defined.
      const currentCenterY = height / 2; // Recalculate based on height prop for this specific call scope
      const currentHeight = height; // Capture height prop for this specific call scope

      updatedPoints = updatedPoints
        .filter(p => (currentCenterY + INDICATOR_RADIUS) + (p.age * TAIL_FALL_SPEED) < currentHeight + TAIL_STROKE_WIDTH)
        .slice(0, MAX_TAIL_POINTS);
      return updatedPoints;
    });
    animationFrameId.current = requestAnimationFrame(animationLoop);
  }, [height, rawIndicatorTargetX]); // Removed centerY, it's derived from height. Kept rawIndicatorTargetX

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
            key={`glow-${index}`}
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