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

// d 几何意义 为 tan( 圆心角 / 4 )
// 绝对值：圆心角 [0, 2 PI]，圆心角 / 4 [0, PI / 2]，tan [0, +∞]
// 
// 区分 小圆弧 还是 大圆弧
//    小圆弧，圆心角 < PI，圆心角 / 4 < PI / 4，tan < 1，|d| < 1
//    大圆弧，圆心角 > PI，圆心角 / 4 > PI / 4，tan > 1，|d| > 1
// 
// d符号，表示圆心的方向（在 圆弧垂线的左边，还是右边）
//    d > 0，和 (终 - 起).otho() 同向
//    d < 0，和 上面 相反
export class Arc {
    p0: Point;
    p1: Point;
    d: number;

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
     * 
     * 圆弧切线，就是 圆弧端点在圆上的切线
     * 
     * 切线向量 和 圆心到圆弧端点的向量 垂直
     * 
     * 算法：以 半弦 为基准，计算切线向量
     * 
     * 圆心 为 O，起点是A，终点是B
     * 
     * 以 A 为圆心，半弦长 为半径，画一个圆，和 AO 相交于 点 C
     * 
     * |AC| = |AB| / 2
     * 
     * 将有向线段 AC 分解到 半弦 和 半弦 垂线上，分别得到下面的 result_dp 和 pp
     */
    tangents(): Pair<Vector> {
        const dp = (this.p1.sub_point(this.p0)).scale(0.5);
        const pp = dp.ortho().scale(-sin2atan(this.d));

        const result_dp = dp.scale(cos2atan(this.d));

        return {
            first: result_dp.add(pp),  // 起点 切线向量，注：没有单位化
            second: result_dp.sub(pp), // 终点 切线向量，注：没有单位化
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
     * 判断 p 是否包含在 圆弧对扇形的夹角内。
     * 
     * 包括 圆弧边缘 的 线
     * 
     */
    wedge_contains_point(p: Point) {
        const t = this.tangents();

        if (Math.abs(this.d) <= 1) {
            // 小圆弧，夹角 小于等于 PI
            // 在 夹角内，意味着 下面两者 同时成立：
            //     向量 <P0, P> 和 起点切线 成 锐角
            //     向量 <P1, P> 和 终点切线 是 钝角
            return (p.sub_point(this.p0)).dot(t.first) >= 0 && (p.sub_point(this.p1)).dot(t.second) <= 0;
        } else {
            // 大圆弧，夹角 大于 PI
            // 如果 点 在 小圆弧 内，那么：下面两者 同时成立
            //     向量 <P0, P> 和 起点切线 成 钝角
            //     向量 <P1, P> 和 终点切线 是 锐角
            // 所以这里要 取反
            return (p.sub_point(this.p0)).dot(t.first) >= 0 || (p.sub_point(this.p1)).dot(t.second) <= 0;
        }
    }

    /**
     * 计算点到圆弧的距离
     */
    distance_to_point(p: Point) {
        if (Math.abs(this.d) < 1e-5) {
            // d = 0, 当 线段 处理
            const arc_segment = new Segment(this.p0, this.p1);
            return arc_segment.distance_to_point(p);
        }

        const difference = this.sub(p);

        if (this.wedge_contains_point(p) && Math.abs(this.d) > 1e-5) {
            // 在 夹角内

            // 距离的绝对值 就是 |点到圆心的距离 - 半径|
            // 符号，看 difference 的 neggative
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
            // 点 到 线段 的 距离 的 平方
            return arc_segment.squared_distance_to_point(p);
        }

        if (this.wedge_contains_point(p) && Math.abs(this.d) > 1e-5) {
            // 在圆弧的 夹角 里面，sdf = 点到圆心的距离 - 半径
            const answer = p.distance_to_point(this.center()) - this.radius();
            return answer * answer;
        }

        // 在 夹角外，就是 点 到 啷个端点距离的 最小值
        const d1 = p.squared_distance_to_point(this.p0);
        const d2 = p.squared_distance_to_point(this.p1);

        return (d1 < d2 ? d1 : d2);
    }

    /**
     * 计算点到圆弧的扩展距离
     */
    extended_dist(p: Point) {
        // m 是 P0 P1 的 中点
        const m = this.p0.lerp(0.5, this.p1);
        
        // dp 是 向量 <P0, P1>
        const dp = this.p1.sub_point(this.p0);
        
        // pp 是 dp 的 正交向量，逆时针
        const pp = dp.ortho();

        // d2 是 圆弧的 圆心角一半 的正切
        const d2 = tan2atan(this.d);

        if (p.sub_point(m).dot(p.sub_point(this.p1)) < 0) {
            // 如果 <M, P> 和 <P1, P> 夹角 为 钝角

            // 距离 = <P0, P> 和 <P0, P1> 的 夹角 的 正切
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