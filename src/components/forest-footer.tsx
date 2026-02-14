import Image from "next/image";

// Many trees, varied sizes and vertical offsets for a dense forest (deterministic for hydration)
const TREE_SIZES = [
  20, 28, 24, 32, 22, 30, 26, 36, 24, 28, 20, 30, 26, 34, 22, 28, 24, 30, 26, 28,
  24, 32, 22, 28, 26, 30, 20, 34, 28, 26, 24, 30, 22, 28, 26, 32, 24, 28, 30, 26,
];
// Vertical offset in pixels (move trees up/down slightly)
const TREE_OFFSETS = [
  0, 4, -2, 3, -1, 2, 0, -3, 1, 2, -2, 0, 3, -1, 2, 0, -2, 1, 0, 3,
  -1, 2, 0, -2, 1, 3, 0, -1, 2, 0, -2, 1, 0, 3, -1, 2, 0, -2, 1, 0,
];

export default function ForestFooter() {
  return (
    <footer className="border-t border-border mt-12">
      <div className="w-full max-w-4xl mx-auto px-4 py-4 flex justify-evenly items-end flex-nowrap min-h-[80px] gap-2 overflow-x-auto scrollbar-hide">
        {TREE_SIZES.map((size, i) => (
          <Image
            key={i}
            src="/timbermarket_logo.svg"
            alt=""
            width={size}
            height={size}
            className="opacity-80 hover:opacity-100 transition-opacity shrink-0"
            style={{ transform: `translateY(${TREE_OFFSETS[i % TREE_OFFSETS.length] ?? 0}px)` }}
          />
        ))}
      </div>
    </footer>
  );
}
