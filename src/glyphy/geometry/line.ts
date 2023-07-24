import { GLYPHY_INFINITY, float_equals } from "../util";
import { Point } from "./point";
import { Vector } from "./vector";
import { SignedVector } from "./signed_vector";

export class Line {

    n: Vector;
    c: number;

    constructor(a: number, b: number, c: number) {
        this.n = new Vector(a, b); /* line normal */
        this.c = c; /* n.x * x + n.y * y = c */
    }

    /**
     * 从 法向量 和 距离 构造 直线
     */
    static from_normal_d(n_: Vector, c_: number) {
        return new Line(n_.x, n_.y, c_);
    }

    /**
     * 从 两点 构造 直线
     */
    static from_points(p0: Point, p1: Point) {
        let n = p1.sub_point(p0).ortho();
        return new Line(n.x, n.y, p0.into_vector().dot(n));
    }

    /**
     * 克隆
     * @returns {Line}
     */
    clone() {
        return new Line(this.n.x, this.n.y, this.c);
    }

    /**
     * 归一化
     * @returns {Line}
     */
    normalized() {
        let d = this.n.len();
        return float_equals(d, 0.0) ? this.clone() : Line.from_normal_d(this.n.div(d), this.c / d);
    }

    /**
     * 返回 法向量
     * @returns {Vector}
     */
    normal() {
        return this.n;
    }

    /**
     * 交点
     */
    intersect(l: Line) {
        let dot = this.n.x * l.n.y - this.n.y * l.n.x;
        if (!dot) {
            return new Point(GLYPHY_INFINITY, GLYPHY_INFINITY);
        }

        return new Point((this.c * l.n.y - this.n.y * l.c) / dot,
            (this.n.x * l.c - this.c * l.n.x) / dot);
    }

    /**
     * 点到直线的最短向量
     */
    sub(p: Point) {
        let mag = -(this.n.dot(p.into_vector()) - this.c) / this.n.len();
        return SignedVector.from_vector(this.n.normalized().scale(mag), mag < 0);
    }
}