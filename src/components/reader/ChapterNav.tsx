import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { Chapter } from '@/types';

interface ChapterNavProps {
  chapters: Chapter[];
  containerRef: React.RefObject<HTMLElement | null>;
  onNavigate?: (anchor: string) => void;
}

/**
 * 章节 id 可能以数字开头（如 `1-introduction`）。它是合法 HTML id，
 * 但直接拼成 `#1-introduction` 不是合法 CSS 选择器，会让 querySelector 抛错。
 */
function findAnchorInContainer(root: HTMLElement, anchor: string) {
  const target = document.getElementById(anchor);
  return target && root.contains(target) ? target : null;
}

export function ChapterNav({ chapters, containerRef, onNavigate }: ChapterNavProps) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(
    chapters[0]?.anchor ?? null
  );

  // 用 IntersectionObserver 监听中间栏当前可视章节
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const targets = chapters
      .map((c) => findAnchorInContainer(root, c.anchor))
      .filter(Boolean) as HTMLElement[];
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 找到最靠近顶部且可见的那个
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // 按 target 在 chapters 中的顺序取第一个可见
        const sorted = visible.sort(
          (a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top
        );
        const firstVisible = sorted[0];
        setActiveAnchor(firstVisible.target.id);
      },
      {
        root,
        rootMargin: '-10% 0px -70% 0px',
        threshold: 0,
      }
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [chapters, containerRef]);

  const handleClick = (anchor: string) => {
    const root = containerRef.current;
    if (!root) return;
    const target = findAnchorInContainer(root, anchor);
    if (target) {
      // 相对滚动容器计算 offsetTop
      const containerTop = root.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      root.scrollBy({ top: targetTop - containerTop - 16, behavior: 'smooth' });
      onNavigate?.(anchor);
    }
  };

  if (chapters.length === 0) return null;

  return (
    <nav className="text-sm">
      <div className="text-xxs uppercase tracking-wider text-text-tertiary font-semibold mb-2 px-2">
        章节
      </div>
      <ul className="space-y-0.5">
        {chapters.map((c) => {
          const isActive = activeAnchor === c.anchor;
          return (
            <li key={c.id}>
              <button
                onClick={() => handleClick(c.anchor)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded transition-colors relative',
                  'hover:bg-gray-100 cursor-pointer',
                  isActive
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-text-secondary',
                  c.level === 2 && 'pl-6 text-xs',
                  c.level === 3 && 'pl-10 text-xs'
                )}
              >
                {isActive && c.level === 1 && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-full" />
                )}
                {c.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
