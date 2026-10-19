'use client';

import { useId, type CSSProperties } from 'react';
import styles from './LogoLoader.module.css';
import { VIEWBOX, OUTLINES, SHAPES, GRADIENTS, LIGHT_GRAYSCALE_GRADIENTS } from './logo-paths';

type LogoLoaderProps = {
  /** Rendered width/height of the mark in px. */
  size?: number;
  /** Cover the viewport with a centered loader (use for route / app loading). */
  fullscreen?: boolean;
  /** Accessible label announced to screen readers. */
  label?: string;
  /** Length of one full trace -> fill -> sheen -> fade cycle, in seconds. */
  duration?: number;
  /** Render in monochrome / grayscale palette. */
  grayscale?: boolean;
  className?: string;
};

// Paint order matters: bowl sits behind the ribbon, the leaf sits on top of the fold.
const FILL_ORDER = [
  ['bowl', 'bowl'],
  ['stem', 'stem'],
  ['fold', 'fold'],
  ['leaf', 'leaf'],
  ['l1', 'l1'],
  ['l2', 'l1'],
  ['l3', 'l1'],
] as const;

// Trace order: ribbon first, then bowl, then the leaf, then the three text lines.
const TRACE_ORDER = ['ribbon', 'bowl', 'leaf', 'l1', 'l2', 'l3'] as const;

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

export default function LogoLoader({
  size = 120,
  fullscreen = false,
  label = 'Loading',
  duration = 2.4,
  grayscale = false,
  className,
}: LogoLoaderProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string) => `ll-${uid}-${name}`;

  const rootStyle = {
    '--ll-size': `${size}px`,
    '--ll-dur': `${duration}s`,
  } as CSSProperties;

  return (
    <div
      className={cx(
        styles.root,
        fullscreen && styles.fullscreen,
        grayscale && styles.grayscale,
        className
      )}
      style={rootStyle}
      role="status"
      aria-live="polite"
    >
      <svg
        className={styles.svg}
        viewBox={VIEWBOX}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {((Object.keys(GRADIENTS)) as (keyof typeof GRADIENTS)[]).map((name) => {
            const g = (grayscale ? LIGHT_GRAYSCALE_GRADIENTS : GRADIENTS)[name];
            return (
              <linearGradient
                key={name}
                id={id(name)}
                gradientUnits="userSpaceOnUse"
                x1={g.x1}
                y1={g.y1}
                x2={g.x2}
                y2={g.y2}
              >
                {g.stops.map(([offset, color]: readonly [number, string]) => (
                  <stop key={offset} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            );
          })}

          {/* Trace line: runs along the logo's own diagonal, light -> brand blue (or luminous paper graphite) */}
          <linearGradient
            id={id('trace')}
            gradientUnits="userSpaceOnUse"
            x1="40"
            y1="30"
            x2="460"
            y2="450"
          >
            <stop offset="0" stopColor={grayscale ? "#f3f1ec" : "#6db7ff"} />
            <stop offset="0.5" stopColor={grayscale ? "#d5d3cd" : "#2a7bff"} />
            <stop offset="1" stopColor={grayscale ? "#9e9a93" : "#0a4fd6"} />
          </linearGradient>

          <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity={grayscale ? 0.35 : 0.55} />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>

          <clipPath id={id('clip')}>
            {FILL_ORDER.map(([key]) => (
              <path key={key} d={SHAPES[key]} />
            ))}
          </clipPath>
        </defs>

        {/* 1. Filled, gradient-accurate logo (fades in after the trace) */}
        <g>
          {FILL_ORDER.map(([key, grad], i) => (
            <path
              key={key}
              className={styles.fill}
              style={{ '--i': i } as CSSProperties}
              d={SHAPES[key]}
              fill={`url(#${id(grad)})`}
              /* 1.2px same-colour stroke closes hairline seams between shapes */
              stroke={`url(#${id(grad)})`}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* 2. Light sweep, clipped to the logo silhouette */}
        <g clipPath={`url(#${id('clip')})`}>
          <rect
            className={styles.sheen}
            x="0"
            y="0"
            width="120"
            height="480"
            fill={`url(#${id('sheen')})`}
          />
        </g>

        {/* 3. The trace: outline drawn along each contour */}
        <g fill="none" strokeLinejoin="round">
          {TRACE_ORDER.map((key, i) => (
            <path
              key={key}
              className={styles.trail}
              style={{ '--i': i } as CSSProperties}
              d={OUTLINES[key]}
              pathLength={1}
              stroke={`url(#${id('trace')})`}
            />
          ))}
          {TRACE_ORDER.map((key, i) => (
            <path
              key={`${key}-head`}
              className={styles.head}
              style={{ '--i': i } as CSSProperties}
              d={OUTLINES[key]}
              pathLength={1}
            />
          ))}
        </g>
      </svg>
      <span className={styles.sr}>{label}</span>
    </div>
  );
}
