const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function numberToWordsUnderThousand(num: number): string {
  if (num === 0) return '';
  const parts: string[] = [];

  const hundreds = Math.floor(num / 100);
  const remainder = num % 100;

  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} Hundred`);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      if (one > 0) {
        parts.push(`${TENS[ten]}-${ONES[one]}`);
      } else {
        parts.push(TENS[ten]);
      }
    }
  }

  return parts.join(' ');
}

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';

  const scales = [
    { value: 1_000_000_000, name: 'Billion' },
    { value: 1_000_000, name: 'Million' },
    { value: 1_000, name: 'Thousand' },
    { value: 1, name: '' },
  ];

  let remaining = num;
  const words: string[] = [];

  for (const scale of scales) {
    if (remaining >= scale.value) {
      const chunk = Math.floor(remaining / scale.value);
      remaining %= scale.value;

      const chunkWords = numberToWordsUnderThousand(chunk);
      if (chunkWords) {
        words.push(scale.name ? `${chunkWords} ${scale.name}` : chunkWords);
      }
    }
  }

  return words.join(' ');
}

/**
 * Converts a numeric amount to English words in UAE Dirhams and Fils.
 * Example:
 * 12345.67 -> "Twelve Thousand Three Hundred Forty-Five Dirhams and Sixty-Seven Fils Only"
 * 1 -> "One Dirham Only"
 * 0.01 -> "One Fils Only"
 */
export function amountInWords(amount: number): string {
  if (isNaN(amount) || amount < 0) {
    return 'Zero Dirhams Only';
  }

  // Round to 2 decimal places to avoid float issues
  const totalCents = Math.round(amount * 100);
  const dirhams = Math.floor(totalCents / 100);
  const fils = totalCents % 100;

  const parts: string[] = [];

  if (dirhams > 0) {
    const dirhamWords = numberToWords(dirhams);
    const unit = dirhams === 1 ? 'Dirham' : 'Dirhams';
    parts.push(`${dirhamWords} ${unit}`);
  }

  if (fils > 0) {
    const filsWords = numberToWords(fils);
    const unit = 'Fils';
    parts.push(`${filsWords} ${unit}`);
  }

  if (parts.length === 0) {
    return 'Zero Dirhams Only';
  }

  return `${parts.join(' and ')} Only`;
}
