import { cn } from '@/lib/utils';

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-6 w-6', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="autoszap-ring" x1="120" y1="180" x2="800" y2="920" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9ED15B" />
          <stop offset="0.56" stopColor="#12A087" />
          <stop offset="1" stopColor="#0D5A9B" />
        </linearGradient>
        <linearGradient id="autoszap-bolt" x1="532" y1="112" x2="758" y2="898" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#CDE57B" />
          <stop offset="0.5" stopColor="#7CCA65" />
          <stop offset="1" stopColor="#1C9B8D" />
        </linearGradient>
        <linearGradient id="autoszap-tail" x1="652" y1="198" x2="938" y2="842" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1E8E85" />
          <stop offset="1" stopColor="#1C7AC2" />
        </linearGradient>
      </defs>

      <path
        d="M808 121C725 73 624 46 516 46C252 46 38 260 38 524C38 644 82 755 156 841L88 967L307 903C371 931 442 946 516 946L559 822C338 822 160 644 160 424C160 204 338 26 559 26C651 26 737 58 805 112L808 121Z"
        fill="url(#autoszap-ring)"
      />
      <path
        d="M864 190C942 275 986 387 986 507C986 711 859 886 671 957L865 190H864Z"
        fill="url(#autoszap-tail)"
      />
      <path
        d="M0 436H330V355L507 490L330 626V545H0V436Z"
        fill="#F4F7FB"
      />
      <path
        d="M845 74L748 412H912L743 412L801 413L511 952L620 540H455L845 74Z"
        fill="url(#autoszap-bolt)"
      />
    </svg>
  );
}
