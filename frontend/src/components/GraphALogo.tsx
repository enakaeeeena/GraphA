interface GraphALogoProps {
  size?: number;
  /** light/dark — лендинг без внешнего круга; framed — GraphPage с круглой рамкой */
  variant?: 'light' | 'dark' | 'framed';
  className?: string;
}

const G_PATH =
  'M32.564 14.18H32.648C35.056 14.18 37.156 14.362 38.948 14.726C40.74 15.09 42.266 15.664 43.526 16.448C44.814 17.204 45.85 18.198 46.634 19.43C47.418 20.634 47.992 22.076 48.356 23.756L44.324 23.924C43.96 22.86 43.484 21.964 42.896 21.236C42.308 20.508 41.552 19.906 40.628 19.43C39.732 18.954 38.64 18.604 37.352 18.38C36.092 18.156 34.608 18.044 32.9 18.044C30.688 18.044 28.798 18.254 27.23 18.674C25.69 19.066 24.416 19.71 23.408 20.606C22.428 21.502 21.714 22.664 21.266 24.092C20.846 25.492 20.636 27.214 20.636 29.258V29.342C20.636 31.302 20.846 32.996 21.266 34.424C21.714 35.824 22.414 36.986 23.366 37.91C24.346 38.834 25.592 39.506 27.104 39.926C28.616 40.346 30.422 40.556 32.522 40.556C34.538 40.556 36.288 40.36 37.772 39.968C39.284 39.576 40.544 39.002 41.552 38.246C42.56 37.462 43.316 36.482 43.82 35.306C44.324 34.13 44.576 32.758 44.576 31.19V30.812L44.996 31.484H31.976V27.62H48.776V44H45.038L44.702 31.904L45.374 32.114C45.234 34.298 44.87 36.16 44.282 37.7C43.722 39.24 42.896 40.514 41.804 41.522C40.712 42.53 39.34 43.272 37.688 43.748C36.064 44.196 34.146 44.42 31.934 44.42C29.302 44.42 27.02 44.112 25.088 43.496C23.156 42.88 21.546 41.942 20.258 40.682C18.97 39.422 18.004 37.854 17.36 35.978C16.744 34.074 16.436 31.862 16.436 29.342V29.258C16.436 26.682 16.758 24.456 17.402 22.58C18.046 20.676 19.04 19.108 20.384 17.876C21.728 16.644 23.408 15.72 25.424 15.104C27.44 14.488 29.82 14.18 32.564 14.18Z';

const STROKE_WIDTH = 2;

export function GraphALogo({ size = 40, variant = 'light', className }: GraphALogoProps) {
  const framed = variant === 'framed';
  const onDarkBg = variant === 'dark';

  const letterFill = onDarkBg ? '#ffffff' : '#3D325F';
  const ballLargeFill = onDarkBg ? '#3D325F' : '#8074A3';
  const ballSmallFill = onDarkBg ? '#ffffff' : '#3D325F';

  // Обводка шариков — цвет фона страницы; на framed — светлая заливка круга
  const ballStroke = framed ? '#ECECED' : onDarkBg ? '#8074A4' : '#fffaeb';

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 65 65"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GraphA"
    >
      {framed && (
        <circle cx="32.5" cy="32.5" r="31.5" fill="#ECECED" stroke="#8074A3" strokeWidth={STROKE_WIDTH} />
      )}
      <path d={G_PATH} fill={letterFill} />
      <circle
        cx="22.5"
        cy="38.5"
        r="5.5"
        fill={ballLargeFill}
        stroke={ballStroke}
        strokeWidth={STROKE_WIDTH}
      />
      <circle
        cx="46"
        cy="22"
        r="3"
        fill={ballSmallFill}
        stroke={ballStroke}
        strokeWidth={STROKE_WIDTH}
      />
    </svg>
  );
}
