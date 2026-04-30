// Returns an array of `size` integers starting at `startAt`.
// e.g. range(2, 4) => [2, 3, 4, 5]
const range = (startAt, size) => [...Array(size).keys()].map((i) => i + startAt);

module.exports = range;
