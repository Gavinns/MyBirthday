import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Candle } from "./models/candle";
import { Cake } from "./models/cake";
import { Table } from "./models/table";
import { BirthdayLove } from "./components/BirthdayLove";
import { Fireworks } from "./components/Fireworks";
import { BirthdayCard } from "./components/BirthdayCard";

import "./App.css";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBounce = (t: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  else return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
const easeOutElastic = (t: number) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

type AnimatedSceneProps = {
  isPlaying: boolean;
  onBackgroundFadeChange?: (opacity: number) => void;
  onEnvironmentProgressChange?: (progress: number) => void;
  candleLit: boolean;
  onAnimationComplete?: () => void;
  cards: ReadonlyArray<BirthdayCardConfig>;
  activeCardId: string | null;
  onToggleCard: (id: string) => void;
};

const CAKE_START_Y = 12;
const CAKE_END_Y = 0;
const CAKE_DESCENT_DURATION = 3.5;

const TABLE_START_Z = 30;
const TABLE_END_Z = 0;
const TABLE_SLIDE_DURATION = 0.8;
const TABLE_SLIDE_START = CAKE_DESCENT_DURATION - TABLE_SLIDE_DURATION - 0.1;

const CANDLE_START_Y = 6;
const CANDLE_END_Y = 0;
const CANDLE_DROP_DURATION = 1.4;
const CANDLE_DROP_START =
  Math.max(CAKE_DESCENT_DURATION, TABLE_SLIDE_START + TABLE_SLIDE_DURATION) + 1.2;

const totalAnimationTime = CANDLE_DROP_START + CANDLE_DROP_DURATION;

const ORBIT_TARGET = new Vector3(0, 1, 0);
const ORBIT_INITIAL_RADIUS = 3;
const ORBIT_INITIAL_HEIGHT = 1;
const ORBIT_INITIAL_AZIMUTH = Math.PI / 2;
const ORBIT_MIN_DISTANCE = 2;
const ORBIT_MAX_DISTANCE = 8;
const ORBIT_MIN_POLAR = Math.PI * 0;
const ORBIT_MAX_POLAR = Math.PI / 2;

const BACKGROUND_FADE_DURATION = 1.2;
const BACKGROUND_FADE_OFFSET = 0;
const BACKGROUND_FADE_END = Math.max(
  CANDLE_DROP_START - BACKGROUND_FADE_OFFSET,
  BACKGROUND_FADE_DURATION
);
const BACKGROUND_FADE_START = Math.max(
  BACKGROUND_FADE_END - BACKGROUND_FADE_DURATION,
  0
);

// ✨ Cuter typed lines with more personality!
const TYPED_LINES = [
  "⤳ hey, Gavinn ! (◕‿◕)",
  "...",
  "⤳ today is my birthday ! ~",
  "...",
  "⤳ so i made this for myself !",
  "...",
  "  ˗ˏˋ happy birthday Gavinn ✦ ˎˊ˗",
  "...",
  "⤳  i hope things will be better for me this year !",
  "...",
  "⤳ press SPASI untuk mulai !",
];
const TYPED_CHAR_DELAY = 85;
const POST_TYPING_SCENE_DELAY = 800;
const CURSOR_BLINK_INTERVAL = 480;

type BirthdayCardConfig = {
  id: string;
  image: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

const BIRTHDAY_CARDS: ReadonlyArray<BirthdayCardConfig> = [
  {
    id: "confetti",
    image: "/card.png",
    position: [1, 0.081, -2],
    rotation: [-Math.PI / 2, 0, Math.PI / 3],
  },
];

// 🎈 Floating emojis for the background overlay
const FLOATING_EMOJIS = ["🎂", "🎈", "✨", "🎉", "🌸", "💖", "🎊", "⭐", "🍰", "💝"];

function AnimatedScene({
  isPlaying,
  onBackgroundFadeChange,
  onEnvironmentProgressChange,
  candleLit,
  onAnimationComplete,
  cards,
  activeCardId,
  onToggleCard,
}: AnimatedSceneProps) {
  const cakeGroup = useRef<Group>(null);
  const tableGroup = useRef<Group>(null);
  const candleGroup = useRef<Group>(null);
  const animationStartRef = useRef<number | null>(null);
  const hasPrimedRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const backgroundOpacityRef = useRef(1);
  const environmentProgressRef = useRef(0);

  useEffect(() => {
    onBackgroundFadeChange?.(backgroundOpacityRef.current);
    onEnvironmentProgressChange?.(environmentProgressRef.current);
  }, [onBackgroundFadeChange, onEnvironmentProgressChange]);

  const emitBackgroundOpacity = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - backgroundOpacityRef.current) > 0.005) {
      backgroundOpacityRef.current = clamped;
      onBackgroundFadeChange?.(clamped);
    }
  };

  const emitEnvironmentProgress = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - environmentProgressRef.current) > 0.005) {
      environmentProgressRef.current = clamped;
      onEnvironmentProgressChange?.(clamped);
    }
  };

  useFrame(({ clock }) => {
    const cake = cakeGroup.current;
    const table = tableGroup.current;
    const candle = candleGroup.current;

    if (!cake || !table || !candle) return;

    if (!hasPrimedRef.current) {
      cake.position.set(0, CAKE_START_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_START_Z);
      table.rotation.set(0, 0, 0);
      candle.position.set(0, CANDLE_START_Y, 0);
      candle.visible = false;
      hasPrimedRef.current = true;
    }

    if (!isPlaying) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
      animationStartRef.current = null;
      hasCompletedRef.current = false;
      completionNotifiedRef.current = false;
      return;
    }

    if (hasCompletedRef.current) {
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
      return;
    }

    if (animationStartRef.current === null) {
      animationStartRef.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - animationStartRef.current;
    const clampedElapsed = clamp(elapsed, 0, totalAnimationTime);

    // Cake descends with a cute little bounce at the end
    const cakeProgress = clamp(clampedElapsed / CAKE_DESCENT_DURATION, 0, 1);
    const cakeEase = cakeProgress < 0.85
      ? easeOutCubic(cakeProgress / 0.85)
      : 1 + Math.sin((cakeProgress - 0.85) / 0.15 * Math.PI) * -0.04;
    cake.position.y = lerp(CAKE_START_Y, CAKE_END_Y, Math.min(cakeEase, 1));
    cake.position.x = 0;
    cake.position.z = 0;
    // Gentle spin that slows down
    cake.rotation.y = easeOutCubic(cakeProgress) * Math.PI * 2;
    cake.rotation.x = 0;
    cake.rotation.z = 0;

    // Table slides in
    let tableZ = TABLE_START_Z;
    if (clampedElapsed >= TABLE_SLIDE_START) {
      const tableProgress = clamp(
        (clampedElapsed - TABLE_SLIDE_START) / TABLE_SLIDE_DURATION,
        0,
        1
      );
      const tableEase = easeOutBounce(tableProgress);
      tableZ = lerp(TABLE_START_Z, TABLE_END_Z, tableEase);
    }
    table.position.set(0, 0, tableZ);
    table.rotation.set(0, 0, 0);

    // Candle drops with elastic bounce
    if (clampedElapsed >= CANDLE_DROP_START) {
      if (!candle.visible) candle.visible = true;
      const candleProgress = clamp(
        (clampedElapsed - CANDLE_DROP_START) / CANDLE_DROP_DURATION,
        0,
        1
      );
      const candleEase = easeOutElastic(candleProgress);
      candle.position.y = lerp(CANDLE_START_Y, CANDLE_END_Y, candleEase);
    } else {
      candle.visible = false;
      candle.position.set(0, CANDLE_START_Y, 0);
    }

    if (clampedElapsed < BACKGROUND_FADE_START) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
    } else {
      const fadeProgress = clamp(
        (clampedElapsed - BACKGROUND_FADE_START) / BACKGROUND_FADE_DURATION,
        0,
        1
      );
      const eased = easeOutCubic(fadeProgress);
      emitBackgroundOpacity(1 - eased);
      emitEnvironmentProgress(eased);
    }

    const animationDone = clampedElapsed >= totalAnimationTime;
    if (animationDone) {
      cake.position.set(0, CAKE_END_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_END_Z);
      candle.position.set(0, CANDLE_END_Y, 0);
      candle.visible = true;
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      hasCompletedRef.current = true;
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
    }
  });

  return (
    <>
      <group ref={tableGroup}>
        <Table />
        <BirthdayLove
          id="love2"
          image="/love2.jpg"
          tablePosition={[0, 0.735, 3]}
          tableRotation={[0, 5.6, 0]}
          isActive={activeCardId === "love2"}
          onToggle={onToggleCard}
          scale={0.75}
        />
        <BirthdayLove
          id="love3"
          image="/love3.jpg"
          tablePosition={[0, 0.735, -3]}
          tableRotation={[0, 4.0, 0]}
          isActive={activeCardId === "love3"}
          onToggle={onToggleCard}
          scale={0.75}
        />
        <BirthdayLove
          id="love4"
          image="/love4.jpg"
          tablePosition={[-1.5, 0.735, 2.5]}
          tableRotation={[0, 5.4, 0]}
          isActive={activeCardId === "love4"}
          onToggle={onToggleCard}
          scale={0.75}
        />
        <BirthdayLove
          id="love1"
          image="/love1.jpg"
          tablePosition={[-1.5, 0.735, -2.5]}
          tableRotation={[0, 4.2, 0]}
          isActive={activeCardId === "love1"}
          onToggle={onToggleCard}
          scale={0.75}
        />
        {cards.map((card) => (
          <BirthdayCard
            key={card.id}
            id={card.id}
            image={card.image}
            tablePosition={card.position}
            tableRotation={card.rotation}
            isActive={activeCardId === card.id}
            onToggle={onToggleCard}
          />
        ))}
      </group>
      <group ref={cakeGroup}>
        <Cake />
      </group>
      <group ref={candleGroup}>
        <Candle isLit={candleLit} scale={0.25} position={[0, 1.1, 0]} />
      </group>
    </>
  );
}

function ConfiguredOrbitControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const offset = new Vector3(
      Math.sin(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS,
      ORBIT_INITIAL_HEIGHT,
      Math.cos(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS
    );
    const cameraPosition = ORBIT_TARGET.clone().add(offset);
    camera.position.copy(cameraPosition);
    camera.lookAt(ORBIT_TARGET);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(ORBIT_TARGET);
      controls.update();
    }
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.04}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
      minPolarAngle={ORBIT_MIN_POLAR}
      maxPolarAngle={ORBIT_MAX_POLAR}
      rotateSpeed={0.6}
      zoomSpeed={0.7}
    />
  );
}

type EnvironmentBackgroundControllerProps = {
  intensity: number;
};

function EnvironmentBackgroundController({
  intensity,
}: EnvironmentBackgroundControllerProps) {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if ("backgroundIntensity" in scene) {
      (scene as typeof scene & { backgroundIntensity: number }).backgroundIntensity = intensity;
    }
  }, [scene, intensity]);

  return null;
}

// 🎈 Individual floating emoji bubble
function FloatingBubble({
  emoji,
  style,
}: {
  emoji: string;
  style: React.CSSProperties;
}) {
  return (
    <div className="floating-bubble" style={style}>
      {emoji}
    </div>
  );
}

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [environmentProgress, setEnvironmentProgress] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [hasAnimationCompleted, setHasAnimationCompleted] = useState(false);
  const [isCandleLit, setIsCandleLit] = useState(true);
  const [fireworksActive, setFireworksActive] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [hintPulse, setHintPulse] = useState(false);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

  // Generate stable floating bubble positions
  const floatingBubbles = useMemo(() =>
    FLOATING_EMOJIS.map((emoji, i) => ({
      emoji,
      style: {
        left: `${5 + (i * 9.3) % 90}%`,
        animationDelay: `${(i * 0.7) % 4}s`,
        animationDuration: `${6 + (i * 1.3) % 5}s`,
        fontSize: `${1.2 + (i * 0.15) % 1}rem`,
        opacity: 0.6 + (i * 0.04) % 0.4,
      } as React.CSSProperties,
    })), []);

  useEffect(() => {
    const audio = new Audio("/music.mp3");
    audio.loop = true;
    audio.preload = "auto";
    backgroundAudioRef.current = audio;
    return () => {
      audio.pause();
      backgroundAudioRef.current = null;
    };
  }, []);

  const playBackgroundMusic = useCallback(() => {
    const audio = backgroundAudioRef.current;
    if (!audio || !audio.paused) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, []);

  const typingComplete = currentLineIndex >= TYPED_LINES.length;

  const typedLines = useMemo(() => {
    if (TYPED_LINES.length === 0) return [""];
    return TYPED_LINES.map((line, index) => {
      if (typingComplete || index < currentLineIndex) return line;
      if (index === currentLineIndex) return line.slice(0, Math.min(currentCharIndex, line.length));
      return "";
    });
  }, [currentCharIndex, currentLineIndex, typingComplete]);

  const cursorLineIndex = typingComplete
    ? Math.max(typedLines.length - 1, 0)
    : currentLineIndex;
  const cursorTargetIndex = Math.max(Math.min(cursorLineIndex, typedLines.length - 1), 0);

  // Pulse hint after animation completes
  useEffect(() => {
    if (!hasAnimationCompleted || !isCandleLit) return;
    const interval = setInterval(() => setHintPulse(p => !p), 900);
    return () => clearInterval(interval);
  }, [hasAnimationCompleted, isCandleLit]);

  useEffect(() => {
    if (!hasStarted) {
      setCurrentLineIndex(0);
      setCurrentCharIndex(0);
      setSceneStarted(false);
      setIsCandleLit(true);
      setFireworksActive(false);
      setHasAnimationCompleted(false);
      return;
    }

    if (typingComplete) {
      if (!sceneStarted) {
        const handle = window.setTimeout(() => setSceneStarted(true), POST_TYPING_SCENE_DELAY);
        return () => window.clearTimeout(handle);
      }
      return;
    }

    const currentLine = TYPED_LINES[currentLineIndex] ?? "";
    const handle = window.setTimeout(() => {
      if (currentCharIndex < currentLine.length) {
        setCurrentCharIndex((prev) => prev + 1);
        return;
      }
      let nextLineIndex = currentLineIndex + 1;
      while (nextLineIndex < TYPED_LINES.length && TYPED_LINES[nextLineIndex].length === 0) {
        nextLineIndex += 1;
      }
      setCurrentLineIndex(nextLineIndex);
      setCurrentCharIndex(0);
    }, TYPED_CHAR_DELAY);

    return () => window.clearTimeout(handle);
  }, [hasStarted, currentCharIndex, currentLineIndex, typingComplete, sceneStarted]);

  useEffect(() => {
    const handle = window.setInterval(() => setCursorVisible((prev) => !prev), CURSOR_BLINK_INTERVAL);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
  if (event.code !== "Space" && event.key !== " ") return;
  event.preventDefault();
  if (!hasStarted) {
    playBackgroundMusic();
    setHasStarted(true);
    return;
  }
      if (hasAnimationCompleted && isCandleLit) {
        setIsCandleLit(false);
        setFireworksActive(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasStarted, hasAnimationCompleted, isCandleLit, playBackgroundMusic, typingComplete]);

  // Also allow tap/click to start on mobile
  const handleStartClick = useCallback(() => {
    if (!hasStarted) {
      playBackgroundMusic();
      setHasStarted(true);
    }
  }, [hasStarted, playBackgroundMusic]);

  const handleBlowCandle = useCallback(() => {
    if (hasAnimationCompleted && isCandleLit) {
      setIsCandleLit(false);
      setFireworksActive(true);
    }
  }, [hasAnimationCompleted, isCandleLit]);

  const handleCardToggle = useCallback((id: string) => {
    setActiveCardId((current) => (current === id ? null : id));
  }, []);

  const isScenePlaying = hasStarted && sceneStarted;

  // Determine if we should show the "start" prompt
  const showStartPrompt = typingComplete && !hasStarted;

  return (
    <div className="App">
      {/* 🌸 Background overlay with terminal + floating bubbles */}
    <div
       className="background-overlay"
        style={{ 
         opacity: backgroundOpacity,
         pointerEvents: backgroundOpacity < 0.05 ? "none" : "auto"
         }}
             onClick={handleStartClick}
          >
        {/* Floating emojis */}
        <div className="bubbles-container">
          {floatingBubbles.map((b, i) => (
            <FloatingBubble key={i} emoji={b.emoji} style={b.style} />
          ))}
        </div>

        {/* Terminal window */}
        <div className="terminal-window">
          <div className="terminal-titlebar">
            <span className="terminal-dot red" />
            <span className="terminal-dot yellow" />
            <span className="terminal-dot green" />
            <span className="terminal-title">Gavinn Birthday</span>
          </div>
          <div className="terminal-body">
            <div className="typed-text">
              {typedLines.map((line, index) => {
                const showCursor =
                  cursorVisible &&
                  index === cursorTargetIndex &&
                  (!typingComplete || !sceneStarted);
                const isVisible = line.length > 0 || index <= currentLineIndex;
                return (
                  <span
                    className={`typed-line ${isVisible ? "visible" : ""} ${
                      line.startsWith("  ˗") ? "special-line" : ""
                    }`}
                    key={`typed-line-${index}`}
                  >
                    {line || "\u00a0"}
                    {showCursor && (
                      <span aria-hidden="true" className="typed-cursor">
                        █
                      </span>
                    )}
                  </span>
                );
              })}
            </div>

            {/* Start prompt */}
            {showStartPrompt && (
              <div className="start-prompt">
                <span className="start-prompt-arrow">▶</span>
                <span>tekan SPASI atau klik di sini ~</span>
              </div>
            )}
          </div>
        </div>
      </div>

     {hasAnimationCompleted && isCandleLit && (
  <div
    className={`hint-overlay ${hintPulse ? "pulse" : ""}`}
    onClick={handleBlowCandle}
    style={{ pointerEvents: "all", cursor: "pointer" }}
  >
    <span>tekan spasi atau klik untuk meniup lilin</span>
    <span className="hint-icon">🕯️</span>
  </div>
     )}

      {/* 🌟 Post-blow message */}
      {hasAnimationCompleted && !isCandleLit && (
        <div className="wish-overlay">
          <div className="wish-text">
            thank for everything !
          </div>
        </div>
      )}

      <Canvas
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 0);
        }}
      >
        <Suspense fallback={null}>
          <AnimatedScene
            isPlaying={isScenePlaying}
            candleLit={isCandleLit}
            onBackgroundFadeChange={setBackgroundOpacity}
            onEnvironmentProgressChange={setEnvironmentProgress}
            onAnimationComplete={() => setHasAnimationCompleted(true)}
            cards={BIRTHDAY_CARDS}
            activeCardId={activeCardId}
            onToggleCard={handleCardToggle}
          />
          <ambientLight intensity={(1 - environmentProgress) * 0.8} />
          <directionalLight
            intensity={0.5}
            position={[2, 10, 0]}
            color={[1, 0.9, 0.95]}
          />
          <Environment
            preset="sunset"
            backgroundRotation={[0, 3.3, 0]}
            environmentRotation={[0, 3.3, 0]}
            background
            environmentIntensity={0.1 * environmentProgress}
            backgroundIntensity={0.05 * environmentProgress}
          />
          <EnvironmentBackgroundController intensity={0.05 * environmentProgress} />
          <Fireworks isActive={fireworksActive} origin={[0, 10, 0]} />
          <ConfiguredOrbitControls />
        </Suspense>
      </Canvas>
    </div>
  );
}