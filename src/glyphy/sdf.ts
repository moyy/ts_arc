import { Point } from "./geometry/point.js";
import { Arc, ArcEndpoint } from "./geometry/arc.js";
import { GLYPHY_EPSILON, GLYPHY_INFINITY } from "./util.js";

/**
 * 点 p 到 所有圆弧的 sdf 的 最小值
 * 
 * TODO 和 shader 的 sdf 进行 同步
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

        // 无穷代表 Move 语义
        if (endpoint.d == GLYPHY_INFINITY) {
            p0 = endpoint.p;
            last_ep = endpoint;
            continue;
        }

        let arc = new Arc(p0, endpoint.p, endpoint.d);
        
        // 在圆弧 夹角范围内
        if (arc.wedge_contains_point(c)) {
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
                    p: last_ep.p
                };
                effect_endpoints = [lp, endpoint];
                side = sdist >= 0 ? -1 : +1;
            }
        } else {
            let la = arc.p0.sub_point(c).len();
            let lb = arc.p1.sub_point(c).len();
            let udist = la < lb ? la : lb;
            if (udist < min_dist) {
                min_dist = udist;
                side = 0; /* unsure */
                closest_arc = arc;
                
                if (last_ep == null) {
                    throw new Error("2 last_ep == null");
                }
                let lp: ArcEndpoint = {
                    d: GLYPHY_INFINITY,
                    p: last_ep.p
                };
                effect_endpoints = [lp, endpoint];

            } else if (side == 0 && udist == min_dist) {
                /* If this new distance is the same as the current minimum,
                 * compare extended distances.  Take the sig;n from the arc
                 * with larger extended distance. */
                let old_ext_dist = closest_arc.extended_dist(c);
                let new_ext_dist = arc.extended_dist(c);

                let ext_dist = Math.abs(new_ext_dist) <= Math.abs(old_ext_dist) ?
                    old_ext_dist : new_ext_dist;

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
