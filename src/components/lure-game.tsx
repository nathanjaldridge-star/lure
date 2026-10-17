import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { getHud, mountLure, subscribeHud, type LureApi } from "@/game/engine";

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LureGame() {
  const hud = useSyncExternalStore(subscribeHud, getHud, getHud);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<LureApi | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = mountLure(canvas);
    gameRef.current = game;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        game.pointer();
      } else if (e.code === "KeyF") {
        game.fire();
      } else if (e.code === "KeyP") {
        game.togglePause();
      } else if (e.code === "KeyM") {
        game.toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const onPointer = (e: React.PointerEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("[data-ui]")) return;
    gameRef.current?.pointer();
  };

  const chargePct = (hud.charge / 1000) * 100;

  return (
    <main
      className="relative h-dvh w-full touch-none overflow-hidden bg-abyss text-foam select-none"
      onPointerDown={onPointer}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {hud.phase === "boot" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          <p className="font-display text-3xl text-foam">{hud.error ?? "Lighting the lure"}</p>
        </div>
      )}

      {hud.phase === "play" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <p className="font-display text-4xl leading-none text-lure tabular-nums" aria-live="polite">
              {hud.score}
            </p>
            <p className="mt-1 text-sm text-mist">
              Lv {hud.level} · {hud.depth} m · {clock(hud.time)}
              {hud.combo >= 2 ? ` · ×${hud.combo}` : ""}
            </p>
            <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-abyss/80">
              <div className="h-full bg-lure" style={{ width: `${chargePct}%` }} />
            </div>
            <p className="mt-1 text-sm text-mist">
              {"●".repeat(hud.lives)}
              {"○".repeat(Math.max(0, 3 - hud.lives))} · {hud.sharks} sharks
              {hud.shell ? " · shell" : ""}
            </p>
          </div>
          <div className="pointer-events-auto flex gap-2" data-ui>
            <IconButton label={hud.muted ? "Unmute" : "Mute"} onClick={() => gameRef.current?.toggleMute()}>
              {hud.muted ? <VolumeX /> : <Volume2 />}
            </IconButton>
            <IconButton label={hud.paused ? "Resume" : "Pause"} onClick={() => gameRef.current?.togglePause()}>
              {hud.paused ? <Play /> : <Pause />}
            </IconButton>
          </div>
        </div>
      ) : null}

      {hud.phase === "play" && hud.mode === "boss" && hud.bossMax > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-6">
          <div className="w-full max-w-xs">
            <p className="text-center text-sm text-mist">Man-of-war</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-abyss/80">
              <div
                className="h-full bg-lure"
                style={{ width: `${(hud.bossHp / hud.bossMax) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {hud.phase === "play" && (hud.weapon || hud.laserLeft > 0 || hud.poopLeft > 0 || hud.pendingPowers > 0) && (
        <div
          className="absolute inset-x-0 bottom-0 flex justify-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          data-ui
        >
          {hud.weapon && (
            <button
              className="h-12 min-w-28 rounded-full bg-lure px-4 text-base font-semibold text-abyss"
              onClick={() => gameRef.current?.fire()}
            >
              {hud.weapon === "laser" ? "Laser" : hud.weapon === "missile" ? "Missile" : "Bomb"} {hud.weaponRank}
            </button>
          )}
          {hud.pendingPowers > 0 && (
            <>
              <button
                className="h-12 rounded-full border border-foam/20 px-4 text-base text-foam"
                onClick={() => gameRef.current?.choosePower("laser")}
              >
                Laser {hud.pendingPowers}
              </button>
              <button
                className="h-12 rounded-full border border-foam/20 px-4 text-base text-foam"
                onClick={() => gameRef.current?.choosePower("poop")}
              >
                Poop {hud.pendingPowers}
              </button>
            </>
          )}
          {hud.laserLeft > 0 && (
            <button
              className="h-12 rounded-full border border-foam/20 px-4 text-base text-foam"
              onClick={() => gameRef.current?.useStored("laser")}
            >
              Lure {hud.laserLeft}
            </button>
          )}
          {hud.poopLeft > 0 && (
            <button
              className="h-12 rounded-full border border-foam/20 px-4 text-base text-foam"
              onClick={() => gameRef.current?.useStored("poop")}
            >
              Poop {hud.poopLeft}
            </button>
          )}
        </div>
      )}

      {hud.phase === "play" && hud.paused && (
        <div className="absolute inset-0 grid place-items-center bg-abyss/55 px-6 backdrop-blur-sm" data-ui>
          <div className="lure-card w-full max-w-sm rounded-card border border-foam/15 bg-deep/90 p-6 text-center">
            <h2 className="font-display text-4xl text-foam">Paused</h2>
            <button
              className="mt-6 h-12 w-full rounded-full bg-lure text-lg font-semibold text-abyss"
              onClick={() => gameRef.current?.togglePause()}
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {hud.phase === "upgrade" && (
        <div className="absolute inset-0 grid place-items-end justify-center bg-abyss/45 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-ui>
          <section className="lure-card lure-panel w-full max-w-md rounded-card border border-foam/15 bg-deep/95 p-6">
            <p className="text-sm tracking-widest text-lure uppercase">Level {hud.level} cleared</p>
            <h2 className="mt-1 font-display text-4xl text-foam">Kit the fish</h2>
            <p className="mt-2 text-mist">Pick a weapon. Choosing it again ranks it up, to three.</p>
            <div className="mt-4 grid gap-2">
              <WeaponButton
                title="Laser beam"
                detail="A straight burn from the lure."
                onClick={() => gameRef.current?.chooseWeapon("laser")}
              />
              <WeaponButton
                title="Missiles"
                detail="They hunt the nearest shark or jelly."
                onClick={() => gameRef.current?.chooseWeapon("missile")}
              />
              <WeaponButton
                title="Bombs"
                detail="A short fuse, then a blast."
                onClick={() => gameRef.current?.chooseWeapon("bomb")}
              />
            </div>
          </section>
        </div>
      )}

      {hud.phase === "menu" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <section className="lure-card lure-panel w-full max-w-md rounded-card border border-foam/15 bg-deep/85 p-6 backdrop-blur-md" data-ui>
            <p className="text-sm font-medium tracking-widest text-lure uppercase">Ten levels</p>
            <h1 className="mt-1 font-display text-6xl leading-none text-foam">Lure</h1>
            <ul className="mt-4 space-y-1.5 text-base text-foam/90">
              <li>Tap to rise. The jump is softer now.</li>
              <li>Eat sharks and little fish. Bigger sharks pay more.</li>
              <li>Dodge jellies and the coral. Catch a falling diver for 500.</li>
              <li>Every 100 points the lure fires for 10 seconds, then the beam goes out.</li>
              <li>Each minute ends in a man-of-war. Bite it when it glows.</li>
            </ul>
            <button
              className="mt-6 h-12 w-full rounded-full bg-lure text-lg font-semibold text-abyss"
              onClick={() => gameRef.current?.pointer()}
            >
              Dive
            </button>
            <p className="mt-3 text-center text-sm text-mist">
              {hud.best > 0 ? `Best · ${hud.best}` : "No bites yet"}
            </p>
            <div className="mt-3 flex justify-center">
              <IconButton label={hud.muted ? "Unmute" : "Mute"} onClick={() => gameRef.current?.toggleMute()}>
                {hud.muted ? <VolumeX /> : <Volume2 />}
              </IconButton>
            </div>
          </section>
        </div>
      )}

      {hud.phase === "results" && (
        <div className="absolute inset-0 flex items-end justify-center bg-abyss/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-ui>
          <section className="lure-card lure-panel w-full max-w-md rounded-card border border-foam/15 bg-deep/95 p-6 text-center">
            <p className="text-sm tracking-widest text-lure uppercase">
              {hud.reason === "cleared" ? "All ten levels" : hud.newBest ? "New best" : "Dive over"}
            </p>
            <h2 className="mt-1 font-display text-5xl text-foam">{hud.score}</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Stat label="Time" value={clock(hud.time)} />
              <Stat label="Sharks" value={String(hud.sharks)} />
              <Stat label="Distance" value={`${hud.depth} m`} />
            </dl>
            {hud.board.length > 0 && (
              <ol className="mt-4 space-y-1 text-left text-sm text-mist">
                {hud.board.map((row, i) => (
                  <li key={`${row.score}-${row.time}-${i}`} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {row.score}
                      {row.won ? " · cleared" : ""}
                    </span>
                    <span>
                      {clock(row.time)} · {row.sharks} · {row.distance} m
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <button
              className="mt-5 h-12 w-full rounded-full bg-lure text-lg font-semibold text-abyss"
              onClick={() => gameRef.current?.diveAgain()}
            >
              Dive again
            </button>
            <button
              className="mt-2 h-11 w-full text-base text-mist"
              onClick={() => gameRef.current?.surface()}
            >
              Surface
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-abyss/50 px-2 py-2">
      <dt className="text-mist">{label}</dt>
      <dd className="font-display text-xl text-foam">{value}</dd>
    </div>
  );
}

function WeaponButton({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      className="rounded-2xl border border-foam/15 px-4 py-3 text-left"
      onClick={onClick}
    >
      <span className="block text-lg text-foam">{title}</span>
      <span className="text-sm text-mist">{detail}</span>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-foam/15 bg-abyss/50 text-foam backdrop-blur-md [&_svg]:size-5"
    >
      {children}
    </button>
  );
}
