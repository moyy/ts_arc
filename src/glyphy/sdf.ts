import { Point } from "./geometry/point.js";
import { Arc, ArcEndpoint } from "./geometry/arc.js";
import { GLYPHY_EPSILON, GLYPHY_INFINITY, is_zero } from "./util.js";
import { Line } from "./geometry/line.js";

/**
 * SDF 算法
 * 
 * 点 p 到 所有圆弧的 sdf 的 最小值
 */
export const glyphy_sdf_from_arc_list = (endpoints: ArcEndpoint[], p: Point): [number, ArcEndpoint[]] => {
    let num_endpoints = endpoints.length;

    let c = p.clone();
    let p0 = new Point()
    let closest_arc = new Arc(p0, p0, 0);

    let min_dist = GLYPHY_INFINITY;
    let side = 0;

    // 影响 min_dist 的 端点
    let last_ep = null;
    let effect_endpoints: ArcEndpoint[] = []

    for (let i = 0; i < num_endpoints; i++) {
        let endpoint = endpoints[i];

        if (endpoint.d == GLYPHY_INFINITY) {
            // 无穷代表 Move 语义
            p0 = endpoint.p;
            last_ep = endpoint;
            continue;
        }

        // 当 d = 0 时候，代表线段
        let arc = new Arc(p0, endpoint.p, endpoint.d);

        if (arc.wedge_contains_point(c)) {
            // 在 扇形夹角范围内

            /* TODO This distance has the wrong sign.  Fix */
            let sdist = arc.distance_to_point(c);

            let udist = Math.abs(sdist) * (1 - GLYPHY_EPSILON);

            if (udist <= min_dist) {
                min_dist = udist;
                if (last_ep == null) {
                    throw new Error("1 last_ep == null");
                }

                let lp: ArcEndpoint = {
                    d: GLYPHY_INFINITY,
                    p: last_ep.p,
                    line_key: null,
                    line_encode: null,
                };
                effect_endpoints = [lp, endpoint];
                side = sdist >= 0 ? -1 : +1;
            }
        } else {
            // 在外面

            // 取 距离 点c 最近的 圆弧端点 的 距离
            let la = arc.p0.sub_point(c).len();
            let lb = arc.p1.sub_point(c).len();
            let udist = la < lb ? la : lb;

            if (udist < min_dist) {
                // 比 原来的 小，则 更新 此距离
                min_dist = udist;

                // 但 此时 符号 未知
                side = 0; /* unsure */

                closest_arc = arc;

                if (last_ep == null) {
                    throw new Error("2 last_ep == null");
                }

                let lp: ArcEndpoint = {
                    d: GLYPHY_INFINITY,
                    p: last_ep.p,
                    line_key: null,
                    line_encode: null,

                };
                effect_endpoints = [lp, endpoint];

            } else if (side == 0 && udist == min_dist) {
                // 如果 更换了 端点 之后，距离和原来相同，但符号未知
                // 则：拿此次 的 符号 作为 原来的符号。

                /** If this new distance is the same as the current minimum,
                  * compare extended distances.  Take the sign from the arc
                  * with larger extended distance. 
                  */
                let old_ext_dist = closest_arc.extended_dist(c);

                // 新的 距离 是 arc 到 c 的 扩展距离
                let new_ext_dist = arc.extended_dist(c);

                let ext_dist = Math.abs(new_ext_dist) <= Math.abs(old_ext_dist) ? old_ext_dist : new_ext_dist;

                /* For emboldening and stuff: */
                // min_dist = fabs (ext_dist);
                side = ext_dist >= 0 ? +1 : -1;
            }
        }

        p0 = endpoint.p;
        last_ep = endpoint;
    }

    if (side == 0) {
        // Technically speaking this should not happen, but it does.  So try to fix it.
        let ext_dist = closest_arc.extended_dist(c);
        side = ext_dist >= 0 ? +1 : -1;
    }

    return [side * min_dist, effect_endpoints];
}
