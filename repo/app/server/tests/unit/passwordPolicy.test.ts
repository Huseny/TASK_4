import { passwordSchema } from '../../src/auth/passwordPolicy';

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    expect(() => passwordSchema.parse('StrongPass1')).not.toThrow();
  });

  it('rejects passwords shorter than 10 characters', () => {
    expect(() => passwordSchema.parse('Ab1')).toThrow();
  });

  it('rejects passwords with only letters (no digit)', () => {
    expect(() => passwordSchema.parse('OnlyLettersHere')).toThrow();
  });

  it('rejects passwords with only digits (no letter)', () => {
    expect(() => passwordSchema.parse('12345678901')).toThrow();
  });

  it('accepts passwords with exactly 10 chars having letter and digit', () => {
    expect(() => passwordSchema.parse('aaaaaaaaaa1')).not.toThrow();
  });
});
