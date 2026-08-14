import React from 'react';
import { menuItemImageSource } from '../utils/helpers';

/**
 * A dish's picture, or an honest stand-in for one.
 *
 * The storefront used to fall back to one of nine stock photos chosen by category name, with momos
 * as the catch-all. That is worse than showing nothing: a guest reading a menu takes the picture as
 * a description of the food, and a plate of momos above "Chicken Crispy" is a claim about the dish
 * that is not true. It also hid the real problem — a photo that never reached Storage looked fine
 * on the storefront while the operator's actual upload sat unpublished on one laptop.
 *
 * With no photo, this renders a deliberate tinted panel carrying the dish's initial:
 * `taste-os-design/references/03-components.md` §2, "the no-photo card must look deliberate — a
 * tinted panel with the dish's initial — not like a broken image."
 *
 * The panel holds the same box as the photo would, so a card never reflows when an image is added.
 */

/** The first letter a person would read, skipping anything that is not a letter or digit. */
function initialOf(name: string) {
  const match = String(name || '').match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '•';
}

type Props = {
  item: any;
  /** `card` matches the menu tile's aspect ratio; `hero` fills the detail sheet's header. */
  variant?: 'card' | 'hero';
  className?: string;
};

export function DishImage({ item, variant = 'card', className = '' }: Props) {
  const source = menuItemImageSource(item);
  const name = String(item?.name || '');

  if (source) {
    return (
      <img
        className={className}
        src={source}
        alt={name}
        // Fixed intrinsic size reserves the box before the file arrives, so the grid does not
        // reflow under a scrolling thumb.
        width={variant === 'hero' ? 800 : 640}
        height={variant === 'hero' ? 480 : 420}
        loading="lazy"
        decoding="async"
      />
    );
  }

  // Deliberately does NOT take `className`. That class styles a photograph — a dark backing
  // colour to sit behind a loading JPEG, a hover zoom, its own aspect ratio — and every one of
  // those fights the panel. The placeholder is not an image; it gets its own box.
  return (
    <div
      className={`dish-placeholder dish-placeholder--${variant}`}
      // The dish name is always rendered directly beneath this, so announcing the initial
      // would just repeat its first letter.
      aria-hidden="true"
    >
      <span className="dish-placeholder-initial">{initialOf(name)}</span>
    </div>
  );
}

export const __test__ = { initialOf };

/**
 * The same contract for the views that build markup as HTML strings — the POS grid and the
 * Express panel. They cannot mount a React component, but they must not fall back to a stock
 * photograph either: a cashier looking at a tile needs to know whether that dish has a picture,
 * and an unrelated one tells them it does.
 *
 * `escape` is passed in rather than imported so this module stays free of a circular dependency
 * with the helpers it would otherwise pull in.
 */
export function dishImageHtml(
  item: any,
  escape: (v: string) => string,
  className = ''
) {
  const source = menuItemImageSource(item);
  const name = String(item?.name || '');

  if (source) {
    return `<img data-menu-image class="${escape(className)}" src="${escape(source)}" alt="${escape(name)}" loading="lazy" decoding="async">`;
  }

  return (
    `<div class="dish-placeholder dish-placeholder--card" aria-hidden="true">` +
    `<span class="dish-placeholder-initial">${escape(initialOf(name))}</span>` +
    `</div>`
  );
}
