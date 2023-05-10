// 浮点数：最小误差
export const GLYPHY_EPSILON = 1e-4;

// 浮点数：无穷
export const GLYPHY_INFINITY = Infinity;

// TODO
export const GLYPHY_MAX_D = 0.5;

/**
 * 返回 是否 无穷
 */
export const is_inf = (x: number) => {
  return x === Infinity || x === -Infinity;
};

/**
 * 比较 浮点数 是否相等
 * @param error; 比较的误差
 */
export const float_equals = (
  f1: number,
  f2: number,
  error = GLYPHY_EPSILON
) => {
  return Math.abs(f1 - f2) < error;
};

/**
 * 比较 浮点数 是否等于0
 * @param error 比较的误差
 */
export const is_zero = (v: number, error = 2 * GLYPHY_EPSILON) => {
  return float_equals(v, 0.0, error);
};

/**
 * 异或
 */
export const xor = (a: boolean, b: boolean) => {
  return (a || b) && !(a && b);
};

/**
 * 断言：参数为false时，抛异常
 */
export const assert = (arg: boolean, msg = "") => {
  if (!arg) {
    throw new Error(`Assertion failed: msg = ${msg}`);
  }
};
