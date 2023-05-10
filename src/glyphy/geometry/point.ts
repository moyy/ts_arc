import { Line } from "./line.js"
import { Vector } from "./vector.js"
import { float_equals } from "../util.js"
import { SignedVector } from "./signed_vector.js";

export class Point {
    x: number;
    y: number;

    constructor(x_ = 0.0, y_ = 0.0) {
        this.x = x_;
        this.y = y_;
    }

    /**
     * Point 转 向量
     */
    into_vector() {
        return new Vector(this.x, this.y);
    }

    /**
     * 通过向量 新建点
     */
    static from_vector(v: Vector) {
        return new Point(v.x, v.y);
    }

    /**
     * 克隆 点
     */
    clone() {
        return new Point(this.x, this.y);
    }

    /**
     * this 是否等于 p
     */
    equals(p: Point) {
        return float_equals(this.x, p.x) && float_equals(this.y, p.y);
    }

    /**
     * 点 加 向量
     */
    add_vector(v: Vector) {
        return new Point(this.x + v.x, this.y + v.y);
    }

    /**
     * 点 减 向量
     */
    sub_vector(v: Vector) {
        return new Point(this.x - v.x, this.y - v.y);
    }

    /**
     * 点 减 点
     */
    sub_point(p: Point) {
        return new Vector(this.x - p.x, this.y - p.y);
    }

    /**
     * 点 加向量 赋值
     */
    add_assign(v: Vector) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    /**
     * 点 减向量 赋值
     */
    sub_assign(v: Vector) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    /**
     * 取中点
     */
    midpoint(p: Point) {
        return new Point((this.x + p.x) / 2.0, (this.y + p.y) / 2.0);
    }

    /**
     * TODO
     */
    bisector(p: Point) {
        let d = p.sub_point(this);
        return new Line(d.x * 2, d.y * 2, p.into_vector().dot(d) + this.into_vector().dot(d));
    }

    /**
     * 到 点p的距离的平方
     */
    squared_distance_to_point(p: Point) {
        let v = this.sub_point(p)
        return v.len2();
    }

    /**
     * 到 点p的距离
     */
    distance_to_point(p: Point) {
        return Math.sqrt(this.squared_distance_to_point(p));
    }

    /**
     * 是否 无穷
     */
    is_infinite() {
        return (this.x === Infinity || this.x === -Infinity)
            && (this.y === Infinity || this.y === -Infinity);
    }

    /**
     * 线性 插值
     */
    lerp(a: number, p: Point) {
        if (a == 0) {
            return this;
        }
        if (a == 1.0) {
            return p;
        }

        return new Point((1 - a) * this.x + a * p.x, (1 - a) * this.y + a * p.y);
    }

    /**
     * 到 线l的最短距离
     */
    shortest_distance_to_line(l: Line): SignedVector {
        return l.sub(this).neg();
    }
}