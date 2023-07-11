import { Point } from "./point.js";
import { Line } from "./line.js";
import { Arc } from "./arc.js";
import { SignedVector } from "./signed_vector.js";

export class Segment {
    p0: Point;
    p1: Point;

    constructor(p0: Point, p1: Point) {
        this.p0 = p0;
        this.p1 = p1;
    }

    /**
     * 从点到线段 的 最短向量
     */
    sub(p: Point): SignedVector {
        // Should the order (p1, p0) depend on d?? 
        return p.shortest_distance_to_line(Line.from_points(this.p1, this.p0));
    }

    /**
     * 到 点p的距离
     */
    distance_to_point(p: Point) {
        if (this.p0 == this.p1) {
            return 0;
        }
        
        // Check if z is between p0 and p1.
        let temp = Line.from_points(this.p0, this.p1);

        if (this.contains_in_span(p)) {
            let v = p.into_vector();
            let d = temp.n.dot(v);
            return -(d - temp.c) / temp.n.len();
        }

        let dist_p_p0 = p.distance_to_point(this.p0);
        let dist_p_p1 = p.distance_to_point(this.p1);

        let d = dist_p_p0 < dist_p_p1 ? dist_p_p0 : dist_p_p1;
        let rv = p.into_vector();
        let mag = temp.n.dot(rv);
        let c = -(mag - temp.c) < 0 ? -1 : 1;

        return d * c
    }

    /**
     * 到 点p的距离的平方
     */
    squared_distance_to_point(p: Point) {
        if (this.p0 == this.p1)
            return 0;

        // Check if z is between p0 and p1.
        let temp = Line.from_points(this.p0, this.p1);
        if (this.contains_in_span(p)) {
            let a = p.into_vector().dot(temp.n) - temp.c;
            return a * a / temp.n.dot(temp.n);
        }

        let dist_p_p0 = p.squared_distance_to_point(this.p0);
        let dist_p_p1 = p.squared_distance_to_point(this.p1);
        return (dist_p_p0 < dist_p_p1 ? dist_p_p0 : dist_p_p1);
    }

    /**
     * 包含 在 线段上
     * @param {Point} p
     * @returns {boolean}
     */
    contains_in_span(p: Point) {
        let p0 = this.p0;
        let p1 = this.p1;

        if (p0 == p1) {
            return false;
        }

        // shortest vector from point to line
        let temp = Line.from_points(p0, p1);
        let v = p.into_vector();
        let d = temp.n.dot(v);
        let mag = -(d - temp.c) / temp.n.len();

        let y = temp.n.normalized().scale(mag);
        let z = p.add_vector(y);

        // Check if z is between p0 and p1.
        if (Math.abs(p1.y - p0.y) > Math.abs(p1.x - p0.x)) {
            return ((z.y - p0.y > 0 && p1.y - p0.y > z.y - p0.y) ||
                (z.y - p0.y < 0 && p1.y - p0.y < z.y - p0.y));
        }
        else {
            return ((0 < z.x - p0.x && z.x - p0.x < p1.x - p0.x) ||
                (0 > z.x - p0.x && z.x - p0.x > p1.x - p0.x));
        }
    }

    /**
     * 到 圆弧的 最大距离
     */
    max_distance_to_arc(a: Arc) {
        let max_distance = Math.abs(a.distance_to_point(this.p0));
        return max_distance > Math.abs(a.distance_to_point(this.p1)) ? max_distance : Math.abs(a.distance_to_point(this.p1));
    }
}