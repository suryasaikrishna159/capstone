/**
 * Generates a unique meeting ID in the format ABC-123-XYZ
 */
const generateMeetingId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  const randomChars = (set, length) =>
    Array.from({ length }, () => set[Math.floor(Math.random() * set.length)]).join('');

  return `${randomChars(chars, 3)}-${randomChars(digits, 3)}-${randomChars(chars, 3)}`;
};

module.exports = generateMeetingId;
