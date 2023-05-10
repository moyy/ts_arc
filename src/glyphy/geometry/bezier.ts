import { Pair } from "./pair.js";
import { Vector } from "./vector.js"
import { Point } from "./point.js";

// 3次 贝塞尔曲线
export class Bezier {
    p0: Point;
    p1: Point;
    p2: Point;
    p3: Point;

    /**
     * @param p0 起点
     * @param p1 控制点1
     * @param p2 控制点2
     * @param p3 终点
     */
    constructor(p0: Point, p1: Point, p2: Point, p3: Point) {
        this.p0 = p0;
        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;
    }

    /**
     * 求 参数t 对应的点
     * @param t 参数
     */
    point(t: number) {
        let p01 = this.p0.lerp(t, this.p1);
        let p12 = this.p1.lerp(t, this.p2);
        let p23 = this.p2.lerp(t, this.p3);

        let p012 = p01.lerp(t, p12);
        let p123 = p12.lerp(t, p23);

        let p0123 = p012.lerp(t, p123);

        return p0123;
    }

    /**
     * 求 中点
     */
    midpoint() {
        let p01 = this.p0.midpoint(this.p1);
        let p12 = this.p1.midpoint(this.p2);
        let p23 = this.p2.midpoint(this.p3);

        let p012 = p01.midpoint(p12);
        let p123 = p12.midpoint(p23);

        let p0123 = p012.midpoint(p123);

        return p0123;
    }

    /**
     * 求 参数t 对应的切线
     * @param t 参数
     */
    tangent(t: number) {
        let t_2_0 = t * t;
        let t_0_2 = (1 - t) * (1 - t);

        let _1__4t_1_0_3t_2_0 = 1 - 4 * t + 3 * t_2_0;
        let _2t_1_0_3t_2_0 = 2 * t - 3 * t_2_0;

        return new Vector(
            -3 * this.p0.x * t_0_2
            + 3 * this.p1.x * _1__4t_1_0_3t_2_0
            + 3 * this.p2.x * _2t_1_0_3t_2_0
            + 3 * this.p3.x * t_2_0,
            -3 * this.p0.y * t_0_2
            + 3 * this.p1.y * _1__4t_1_0_3t_2_0
            + 3 * this.p2.y * _2t_1_0_3t_2_0
            + 3 * this.p3.y * t_2_0);
    }

    /**
     * 求 参数t 对应的切线
     * @param t 参数
     */
    d_tangent(t: number) {
        return new Vector(6 * ((-this.p0.x + 3 * this.p1.x - 3 * this.p2.x + this.p3.x) * t + (this.p0.x - 2 * this.p1.x + this.p2.x)),
            6 * ((-this.p0.y + 3 * this.p1.y - 3 * this.p2.y + this.p3.y) * t + (this.p0.y - 2 * this.p1.y + this.p2.y)));
    }

    /**
     * 求 参数t 对应的曲率
     * @param t 参数
     */
    curvature(t: number) {
        let dpp = this.tangent(t).ortho();
        let ddp = this.d_tangent(t);

        // normal vector len squared */
        let len = dpp.len();
        let curvature = (dpp.dot(ddp)) / (len * len * len);
        return curvature;
    }

    /**
     * 分割 曲线
     * @param t 参数
     */
    split(t: number): Pair<Bezier> {
        let p01 = this.p0.lerp(t, this.p1);
        let p12 = this.p1.lerp(t, this.p2);
        let p23 = this.p2.lerp(t, this.p3);
        let p012 = p01.lerp(t, p12);
        let p123 = p12.lerp(t, p23);
        let p0123 = p012.lerp(t, p123);

        let first = new Bezier(this.p0, p01, p012, p0123)
        let second = new Bezier(p0123, p123, p23, this.p3)
        return { first, second }
    }

    /**
     * TODO
     */
    halve(): Pair<Bezier> {
        let p01 = this.p0.midpoint(this.p1);
        let p12 = this.p1.midpoint(this.p2);
        let p23 = this.p2.midpoint(this.p3);

        let p012 = p01.midpoint(p12);
        let p123 = p12.midpoint(p23);

        let p0123 = p012.midpoint(p123);

        let first = new Bezier(this.p0, p01, p012, p0123);
        let second = new Bezier(p0123, p123, p23, this.p3);

        return { first, second };
    }

    /**
     * TODO
     * @param t0 {number} 参数
     * @param t1 {number} 参数
     * @returns {Bezier}
     */
    segment(t0: number, t1: number) {
        let p01 = this.p0.lerp(t0, this.p1);
        let p12 = this.p1.lerp(t0, this.p2);
        let p23 = this.p2.lerp(t0, this.p3);
        let p012 = p01.lerp(t0, p12);
        let p123 = p12.lerp(t0, p23);
        let p0123 = p012.lerp(t0, p123);

        let q01 = this.p0.lerp(t1, this.p1);
        let q12 = this.p1.lerp(t1, this.p2);
        let q23 = this.p2.lerp(t1, this.p3);
        let q012 = q01.lerp(t1, q12);
        let q123 = q12.lerp(t1, q23);
        let q0123 = q012.lerp(t1, q123);

        let rp0 = p0123;
        let rp1 = p0123.add_vector(p123.sub_point(p0123).scale((t1 - t0) / (1 - t0)));
        let rp2 = q0123.add_vector(q012.sub_point(q0123).scale((t1 - t0) / t1));
        let rp3 = q0123;
        return new Bezier(rp0, rp1, rp2, rp3);
    }
}