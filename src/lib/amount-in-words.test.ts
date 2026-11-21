import { describe, it, expect } from 'vitest';
import { amountInWords } from './amount-in-words';

describe('amountInWords', () => {
  it('handles 0.01 (fils only)', () => {
    expect(amountInWords(0.01)).toBe('One Fils Only');
  });

  it('handles 1 (single dirham)', () => {
    expect(amountInWords(1)).toBe('One Dirham Only');
  });

  it('handles 15', () => {
    expect(amountInWords(15)).toBe('Fifteen Dirhams Only');
  });

  it('handles 100', () => {
    expect(amountInWords(100)).toBe('One Hundred Dirhams Only');
  });

  it('handles 1000.50', () => {
    expect(amountInWords(1000.50)).toBe('One Thousand Dirhams and Fifty Fils Only');
  });

  it('handles 12345.67', () => {
    expect(amountInWords(12345.67)).toBe(
      'Twelve Thousand Three Hundred Forty-Five Dirhams and Sixty-Seven Fils Only'
    );
  });

  it('handles 1000000 (one million)', () => {
    expect(amountInWords(1000000)).toBe('One Million Dirhams Only');
  });

  it('handles 0', () => {
    expect(amountInWords(0)).toBe('Zero Dirhams Only');
  });
});
