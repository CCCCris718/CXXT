import React, { useLayoutEffect, useRef } from 'react';

export type AutoFitOneLineProps = {
  children: React.ReactNode;
  className?: string;
  /** 最大字号（px），默认 34 */
  maxFontSize?: number;
  /** 最小字号（px），再长则省略显示 */
  minFontSize?: number;
  title?: string;
};

/**
 * 单行显示子节点：在容器宽度内从 maxFontSize 逐级缩小字号直至能放下；仍放不下则在最小字号下省略。
 */
export const AutoFitOneLine: React.FC<AutoFitOneLineProps> = ({
  children,
  className,
  maxFontSize = 34,
  minFontSize = 11,
  title,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;

    const fit = () => {
      const maxW = wrap.clientWidth;
      if (maxW <= 0) return;

      let size = maxFontSize;
      text.style.whiteSpace = 'nowrap';
      text.style.fontSize = `${size}px`;

      while (size > minFontSize && text.scrollWidth > maxW) {
        size -= 1;
        text.style.fontSize = `${size}px`;
      }

      wrap.style.overflow = 'hidden';
    };

    fit();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(fit);
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
    };
  }, [children, maxFontSize, minFontSize]);

  return (
    <div ref={wrapRef} className={className} style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <span
        ref={textRef}
        title={title}
        style={{
          display: 'block',
          fontWeight: 700,
          lineHeight: 1.2,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
    </div>
  );
};

export default AutoFitOneLine;
