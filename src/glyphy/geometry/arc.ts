import { Point } from "./point.js";
import { Vector } from "./vector.js";
import { float_equals, xor } from "../util.js"
import { Segment } from "./segment.js";
import { SignedVector } from "./signed_vector.js";
import { Pair } from "./pair.js";
import { Bezier } from "./bezier.js";
import { Line } from "./line.js";
import { AABB } from "./aabb.js";

// sin( 2 * atan(d) )
export const sin2atan = (d: number) => {
    return 2 * d / (1 + d * d);
}

// cos( 2 * atan(d) )
export const cos2atan = (d: number) => {
    return (1 - d * d) / (1 + d * d);
}

// tan( 2 * atan(d) )
export const tan2atan = (d: number) => {
    return 2 * d / (1 - d * d);
}

export interface ErrorValue {
    value: number;
}

export interface ArcEndpoint {
    p: Point;
    d: number;

    // 线段特殊处理，只有一个值
    line_key: null | string,
    line_encode: null | [number, number, number, number]; // rgba
}

export const create_arc_endpoint = (x: number, y: number, d: number): ArcEndpoint => {
    return {
        p: new Point(x, y),
        d: d,
        line_key: null,
        line_encode: null,
    }
}

export class Arc {
    p0: Point;
    p1: Point;
    d: number;  // 几何意义: 2.0 * atan(d) = 圆弧角度；d = 0.0 时，为直线

    /**
     * 构造函数
     */
    constructor(p0: Point, p1: Point, d: number) {
        this.p0 = p0;
        this.p1 = p1;
        this.d = d;
    }

    /**
     * 从三个点 构造 圆弧
     * @param p0 起点
     * @param p1 终点
     * @param pm 中间点
     * @param complement 是否补弧
     */
    static from_points(p0: Point, p1: Point, pm: Point, complement: boolean) {
        let arc = new Arc(p0, p1, 0.0);
        if (p0 != pm && p1 != pm) {
            let v = p1.sub_point(pm);
            let u = p0.sub_point(pm);
            arc.d = Math.tan(((v.angle() - u.angle()) / 2) - (complement ? 0 : Math.PI / 2));
        }
        return arc
    }

    /**
     * 从圆心、半径、起始角度、终止角度 构造 圆弧
     * @param center 圆心
     * @param radius 半径
     * @param a0 起始角度
     * @param a1 终止角度
     * @param complement 是否补弧
     */
    static from_center_radius_angle(center: Point, radius: number, a0: number, a1: number, complement: boolean) {

        let p0 = center.add_vector(new Vector(Math.cos(a0), Math.sin(a0)).scale(radius));
        let p1 = center.add_vector(new Vector(Math.cos(a1), Math.sin(a1)).scale(radius));
        let d = Math.tan(((a1 - a0) / 4) - (complement ? 0 : Math.PI / 2));
        return new Arc(p0, p1, d);
    }

    to_svg_command(): string {
        const start_point = this.p0;
        const end_point = this.p1;

        const radius = this.radius();
        const center = this.center();

        const start_angle = Math.atan2(start_point.y - center.y, start_point.x - center.x);
        const end_angle = Math.atan2(end_point.y - center.y, end_point.x - center.x);

        // large-arc-flag 是一个布尔值（0 或 1），表示是否选择较大的弧（1）或较小的弧（0）
        const large_arc_flag = Math.abs(end_angle - start_angle) > Math.PI ? 1 : 0;

        // sweep-flag 是一个布尔值（0 或 1），表示弧是否按顺时针（1）或逆时针（0）方向绘制。
        const sweep_flag = this.d > 0 ? 1 : 0;

        // x-axis-rotation 是椭圆的 x 轴与水平方向的夹角，单位为度。
        // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        const arc_command = `A ${radius} ${radius} 0 ${large_arc_flag} ${sweep_flag} ${end_point.x} ${end_point.y}`;

        return arc_command;
    }

    /**
     * 克隆
     */
    clone() {
        return new Arc(this.p0, this.p1, this.d);
    }

    /**
     * 相等
     */
    equals(a: Arc) {
        return this.p0.equals(a.p0) && this.p1.equals(a.p1) && float_equals(this.d, a.d);
    }

    /**
     * 减去 点
     */
    sub(p: Point) {
        if (Math.abs(this.d) < 1e-5) {
            const arc_segment = new Segment(this.p0, this.p1);
            return arc_segment.sub(p);
        }

        if (this.wedge_contains_point(p)) {
            const difference = this.center()
                .sub_point(p)
                .normalized()
                .scale(Math.abs(p.distance_to_point(this.center()) - this.radius()));

            let d = xor(this.d < 0, p.sub_point(this.center()).len() < this.radius());
            return SignedVector.from_vector(difference, d);
        }

        const d0 = p.squared_distance_to_point(this.p0);
        const d1 = p.squared_distance_to_point(this.p1);

        const other_arc = new Arc(this.p0, this.p1, (1.0 + this.d) / (1.0 - this.d));
        const normal = this.center().sub_point(d0 < d1 ? this.p0 : this.p1);

        if (normal.len() === 0) {
            return SignedVector.from_vector(new Vector(0, 0), true);
        }

        let min_p = d0 < d1 ? this.p0 : this.p1;
        let l = new Line(normal.x, normal.y, normal.dot(min_p.into_vector()));
        return SignedVector.from_vector(l.sub(p), !other_arc.wedge_contains_point(p));
    }

    /**
     * 计算圆弧的半径
     * @returns {number} 圆弧半径
     */
    radius() {
        return Math.abs((this.p1.sub_point(this.p0)).len() / (2 * sin2atan(this.d)));
    }

    /**
     * 计算圆弧的圆心
     * @returns {Point} 圆弧的圆心
     */
    center() {
        return (this.p0.midpoint(this.p1)).add_vector((this.p1.sub_point(this.p0)).ortho().scale(1 / (2 * tan2atan(this.d))));
    }

    /**
     * 计算圆弧 的 切线向量对
     */
    tangents(): Pair<Vector> {
        const dp = (this.p1.sub_point(this.p0)).scale(0.5);
        const pp = dp.ortho().scale(-sin2atan(this.d));

        const result_dp = dp.scale(cos2atan(this.d));

        return {
            first: result_dp.add(pp),
            second: result_dp.sub(pp),
        };
    }

    /**
     * 将圆弧近似为贝塞尔曲线
     */
    approximate_bezier(error: ErrorValue) {
        const dp = this.p1.sub_point(this.p0);
        const pp = dp.ortho();

        if (error) {
            error.value = dp.len() * Math.pow(Math.abs(this.d), 5) / (54 * (1 + this.d * this.d));
        }

        const result_dp = dp.scale((1 - this.d * this.d) / 3);
        const result_pp = pp.scale(2 * this.d / 3);

        const p0s = this.p0.add_vector(result_dp).sub_vector(result_pp);
        const p1s = this.p1.sub_vector(result_dp).sub_vector(result_pp);

        return new Bezier(this.p0, p0s, p1s, this.p1);
    }

    /**
     * 判断圆弧的楔形是否包含给定的点
     */
    wedge_contains_point(p: Point) {
        const t = this.tangents();

        if (Math.abs(this.d) <= 1) {
            return (p.sub_point(this.p0)).dot(t.first) >= 0 && (p.sub_point(this.p1)).dot(t.second) <= 0;
        } else {
            return (p.sub_point(this.p0)).dot(t.first) >= 0 || (p.sub_point(this.p1)).dot(t.second) <= 0;
        }
    }

    /**
     * 计算点到圆弧的距离
     */
    distance_to_point(p: Point) {
        if (Math.abs(this.d) < 1e-5) {
            const arc_segment = new Segment(this.p0, this.p1);
            return arc_segment.distance_to_point(p);
        }

        const difference = this.sub(p);

        if (this.wedge_contains_point(p) && Math.abs(this.d) > 1e-5) {
            return Math.abs(p.distance_to_point(this.center()) - this.radius()) * (difference.negative ? -1 : 1);
        }

        const d1 = p.squared_distance_to_point(this.p0);
        const d2 = p.squared_distance_to_point(this.p1);

        return (d1 < d2 ? Math.sqrt(d1) : Math.sqrt(d2)) * (difference.negative ? -1 : 1);
    }

    /**
     * 计算点到圆弧的平方距离
     */
    squared_distance_to_point(p: Point) {
        if (Math.abs(this.d) < 1e-5) {
            const arc_segment = new Segment(this.p0, this.p1);
            return arc_segment.squared_distance_to_point(p);
        }

        if (this.wedge_contains_point(p) && Math.abs(this.d) > 1e-5) {
            const answer = p.distance_to_point(this.center()) - this.radius();
            return answer * answer;
        }

        const d1 = p.squared_distance_to_point(this.p0);
        const d2 = p.squared_distance_to_point(this.p1);

        return (d1 < d2 ? d1 : d2);
    }

    /**
     * 计算点到圆弧的扩展距离
     */
    extended_dist(p: Point) {
        const m = this.p0.lerp(0.5, this.p1);
        const dp = this.p1.sub_point(this.p0);
        const pp = dp.ortho();
        const d2 = tan2atan(this.d);

        if (p.sub_point(m).dot(p.sub_point(this.p1)) < 0) {
            return (p.sub_point(this.p0)).dot((pp.add(dp.scale(d2))).normalized());
        } else {
            return (p.sub_point(this.p1)).dot((pp.sub(dp.scale(d2))).normalized());
        }
    }

    /**
     * 计算圆弧的包围盒
     * @returns {Array<Point>} 包围盒的顶点数组
     */
    extents(e: AABB) {
        e.clear()
        e.add(this.p0);
        e.add(this.p1);

        const c = this.center();
        const r = this.radius();
        const p = [
            c.add_vector(new Vector(-1, 0).scale(r)),
            c.add_vector(new Vector(1, 0).scale(r)),
            c.add_vector(new Vector(0, -1).scale(r)),
            c.add_vector(new Vector(0, 1).scale(r)),
        ];

        for (let i = 0; i < 4; i++) {
            if (this.wedge_contains_point(p[i])) {
                e.add(p[i]);
            }
        }
    }
}

/**
 * 圆弧 减去 点
 */
export const sub_point_from_arc = (p: Point, a: Arc) => {
    return a.sub(p).neg();
}