
/*
 * Approximate outlines with multiple arcs
 */

import { GLYPHY_INFINITY, GLYPHY_MAX_D, is_zero } from "glyphy/util.js";
import { Arc, ArcEndpoint } from "./arc.js";
import { Point } from "./point.js"
import { AABB } from "./aabb.js";
import { Bezier } from "./bezier.js";
import { ArcBezierApproximatorQuantized, ArcBezierApproximatorQuantizedDefault, ArcBezierErrorApproximatorDefault } from "../arc_bezier.js"

export class GlyphyArcAccumulator {
    result: ArcEndpoint[];

    tolerance: number;
    max_d: number;
    d_bits: number;

    start_point: Point;
    current_point: Point;
    need_moveto: boolean;
    num_endpoints: number;
    max_error: number;
    success: boolean;

    constructor() {
        this.result = [];
        this.tolerance = 5e-4;
        this.max_d = GLYPHY_MAX_D;
        this.d_bits = 8;
        this.start_point = new Point(0, 0);
        this.current_point = new Point(0, 0);
        this.need_moveto = true;
        this.num_endpoints = 0;
        this.max_error = 0;
        this.success = true;

        this.reset();
    }

    reset() {
        this.start_point = this.current_point = new Point(0, 0);
        this.need_moveto = true;
        this.num_endpoints = 0;
        this.max_error = 0;
        this.success = true;
    }

    // d = inf，就是 移动点
    move_to(p: Point) {
        if (!this.num_endpoints || !p.equals(this.current_point)) {
            this.accumulate(p, GLYPHY_INFINITY);
        }
    }

    // d = 0 就是 线段
    line_to(p1: Point) {
        this.arc_to(p1, 0)
    }

    // 2次 贝塞尔，升阶到 3次; 公式见: https://blog.csdn.net/xhhjin/article/details/62905007
    //
    // 输入：
    //	 + P0, P2 是 2次 Bezier 的 起点，终点
    //	 + P1 是 控制点；
    //
    // 升阶到 3次后：
    //   + Q0, Q3 是 3次 Beizer 的 起点，终点
    //	 + Q1, Q2 是 控制点
    //
    // 算法：
    //   + Q0 = P0
    //	 + Q1 = 1 / 3 * P0 + 2 / 3 * P1
    //	 + Q2 = 1 / 3 * P2 + 2 / 3 * P1
    //	 + Q3 = P2
    // 
    conic_to(p1: Point, p2: Point) {
        let b = new Bezier(
            this.current_point,
            this.current_point.lerp(2 / 3., p1),
            p2.lerp(2 / 3., p1),
            p2
        );
        this.bezier(b);
    }

    // 3次 贝塞尔曲线，用 圆弧 拟合
    cubic_to(p1: Point, p2: Point, p3: Point) {
        let b = new Bezier(this.current_point, p1, p2, p3);
        this.bezier(b);
    }

    close_path() {
        if (!this.need_moveto && !this.current_point.equals(this.start_point)) {
            this.arc_to(this.start_point, 0);
        }
    }

    emit(p: Point, d: number) {
        let endpoint = { p, d };
        this.result.push(endpoint);

        this.num_endpoints++;
        this.current_point = p;
    }

    accumulate(p: Point, d: number) {
        if (p.equals(this.current_point)) {
            return;
        }

        if (d == GLYPHY_INFINITY) {
            /* Emit moveto lazily, for cleaner outlines */
            this.need_moveto = true;
            this.current_point = p;
            return;
        }
        if (this.need_moveto) {
            this.emit(this.current_point, GLYPHY_INFINITY);
            this.start_point = this.current_point;
            this.need_moveto = false;
        }
        this.emit(p, d);
    }

    arc_to(p1: Point, d: number) {
        this.accumulate(p1, d);
    }

    // 圆弧 拟合 贝塞尔
    bezier(b: Bezier) {
        let appx = new ArcBezierApproximatorQuantized<typeof ArcBezierErrorApproximatorDefault>(this.max_d, this.d_bits)

        // 圆弧 拟合 贝塞尔 的 主要实现
        let impl = new ArcsBezierApproximatorSpringSystem();

        let arcs: Arc[] = [];
        let e = impl.approximate_bezier_with_arcs(b, this.tolerance, appx, arcs);

        this.max_error = Math.max(this.max_error, e);

        this.move_to(b.p0);
        for (let i = 0; i < arcs.length; i++) {
            this.arc_to(arcs[i].p1, arcs[i].d);
        }
    }
}

export const glyphy_arc_list_extents = (endpoints: ArcEndpoint[], extents: AABB): void => {
    let p0 = new Point(0, 0);
    extents.clear()

    let num_endpoints = endpoints.length;
    for (let i = 0; i < num_endpoints; i++) {
        const endpoint = endpoints[i];
        if (endpoint.d === GLYPHY_INFINITY) {
            p0 = endpoint.p;
            continue;
        }
        const arc = new Arc(p0, endpoint.p, endpoint.d);
        p0 = endpoint.p;

        const arc_extents = new AABB();
        arc.extents(arc_extents);
        extents.extend(arc_extents);
    }
}



class ArcsBezierApproximatorSpringSystem {
    calc_arcs(
        b: Bezier,
        t: number[],
        appx: ArcBezierApproximatorQuantizedDefault,
        e: number[],
        arcs: Arc[],
        max_e: number,
        min_e: number) {

        let n = t.length - 1;

        e.length = n;
        arcs.length = 0;
        max_e = 0;
        min_e = GLYPHY_INFINITY;

        for (let i = 0; i < n; i++) {
            let segment = b.segment(t[i], t[i + 1]);
            let temp = {
                value: e[i]
            };
            let arc = appx.approximate_bezier_with_arc(segment, temp, ArcBezierErrorApproximatorDefault);
            arcs.push(arc);
            e[i] = temp.value;

            max_e = Math.max(max_e, e[i]);
            min_e = Math.min(min_e, e[i]);
        }

        return [min_e, max_e];
    }

    jiggle(
        b: Bezier,
        appx: ArcBezierApproximatorQuantizedDefault,
        t: number[],
        e: number[],
        arcs: Arc[],
        max_e: number,
        min_e: number,
        tolerance: number,
    ) {
        let n = t.length - 1;
        let conditioner = tolerance * .01;
        let max_jiggle = Math.log2(n) + 1;
        let s;

        let n_jiggle = 0;
        for (s = 0; s < max_jiggle; s++) {
            let total = 0;
            for (let i = 0; i < n; i++) {
                let l = t[i + 1] - t[i];
                let k_inv = l * Math.pow(e[i] + conditioner, -.3);
                total += k_inv;
                e[i] = k_inv;
            }
            for (let i = 0; i < n; i++) {
                let k_inv = e[i];
                let l = k_inv / total;
                t[i + 1] = t[i] + l;
            }
            t[n] = 1.0; // Do this to get real 1.0, not .9999999999999998!

            [min_e, max_e] = this.calc_arcs(b, t, appx, e, arcs, max_e, min_e);

            //fprintf (stderr, "n %d jiggle %d max_e %g min_e %g\n", n, s, max_e, min_e);

            n_jiggle++;
            if (max_e < tolerance || (2 * min_e - max_e > tolerance))
                break;
        }
        return [n_jiggle, min_e, max_e];
    }

    // 圆弧 拟合 3次 Bezier
    // 返回 最大误差
    approximate_bezier_with_arcs(
        b: Bezier,
        tolerance: number,
        appx: ArcBezierApproximatorQuantizedDefault,
        arcs: Arc[],
        max_segments = 100) {

        /* Handle fully-degenerate cases. */
        let v1 = b.p1.sub_point(b.p0);
        let v2 = b.p2.sub_point(b.p0);
        let v3 = b.p3.sub_point(b.p0);
        if (is_zero(v1.cross(v2)) && is_zero(v2.cross(v3))) {
            // Curve has no area.  If endpoints are NOT the same, replace with single line segment.  Otherwise fully skip. */
            arcs.length = 0;
            if (!b.p0.equals(b.p1)) {
                arcs.push(new Arc(b.p0, b.p3, 0));
            }
            return 0;
        }

        let t: number[] = [];
        let e: number[] = [];

        let max_e = 0.0;
        let min_e = 0.0;
        let n_jiggle = 0;

        /* Technically speaking we can bsearch for n. */
        for (let n = 1; n <= max_segments; n++) {
            t.length = n + 1;
            for (let i = 0; i < n; i++)
                t[i] = i / n;
            t[n] = 1.0; // Do this out of the loop to get real 1.0, not .9999999999999998!

            [min_e, max_e] = this.calc_arcs(b, t, appx, e, arcs, max_e, min_e);

            let jiggle = 0;
            for (let i = 0; i < n; i++)
                if (e[i] <= tolerance) {
                    [jiggle, min_e, max_e] = this.jiggle(b, appx, t, e, arcs, max_e, min_e, tolerance);
                    n_jiggle += jiggle;
                    break;
                }

            if (max_e <= tolerance)
                break;
        }
        return max_e;
    }
};