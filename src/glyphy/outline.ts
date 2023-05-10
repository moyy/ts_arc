import { Arc, ArcEndpoint } from "./geometry/arc.js";
import { Point } from "./geometry/point.js";
import { GLYPHY_EPSILON, GLYPHY_INFINITY, xor } from "./util.js";

const glyphy_outline_reverse = (endpoints: ArcEndpoint[]) => {
    let num_endpoints = endpoints.length;

    if (!num_endpoints) {
        return;
    }

    // Shift the d's first
    let d0 = endpoints[0].d;
    for (let i = 0; i < num_endpoints - 1; i++) {
        endpoints[i].d = endpoints[i + 1].d == GLYPHY_INFINITY ? GLYPHY_INFINITY : -endpoints[i + 1].d;
    }
    endpoints[num_endpoints - 1].d = d0;

    // Reverse
    for (let i = 0, j = num_endpoints - 1; i < j; i++, j--) {
        let t = endpoints[i];
        endpoints[i] = endpoints[j];
        endpoints[j] = t;
    }
}

export const winding = (endpoints: ArcEndpoint[]) => {
    let num_endpoints = endpoints.length;

    /*
     * Algorithm:
     *
     * - Approximate arcs with triangles passing through the mid- and end-points,
     * - Calculate the area of the contour,
     * - Return sign.
     */

    let area = 0;
    for (let i = 1; i < num_endpoints; i++) {
        const p0 = endpoints[i - 1].p;
        const p1 = endpoints[i].p;
        const d = endpoints[i].d;

        console.assert(d != GLYPHY_INFINITY);

        area += p0.into_vector().cross(p1.into_vector());
        area -= 0.5 * d * p1.sub_point(p0).len2();
    }
    return area < 0;
}

/*
    * Algorithm:
    *
    * - For a point on the contour, draw a halfline in a direction
    *   (eg. decreasing x) to infinity,
    * - Count how many times it crosses all other contours,
    * - Pay special attention to points falling exactly on the halfline,
    *   specifically, they count as +.5 or -.5, depending the direction
    *   of crossing.
    *
    * All this counting is extremely tricky:
    *
    * - Floating point equality cannot be relied on here,
    * - Lots of arc analysis needed,
    * - Without having a point that we know falls /inside/ the contour,
    *   there are legitimate cases that we simply cannot handle using
    *   this algorithm.  For example, imagine the following glyph shape:
    *
    *         +---------+
    *         | +-----+ |
    *         |  \   /  |
    *         |   \ /   |
    *         +----o----+
    *
    *   If the glyph is defined as two outlines, and when analysing the
    *   inner outline we happen to pick the point denoted by 'o' for
    *   analysis, there simply is no way to differentiate this case from
    *   the following case:
    *
    *         +---------+
    *         |         |
    *         |         |
    *         |         |
    *         +----o----+
    *             / \
    *            /   \
    *           +-----+
    *
    *   However, in one, the triangle should be filled in, and in the other
    *   filled out.
    *
    *   One way to work around this may be to do the analysis for all endpoints
    *   on the outline and take majority.  But even that can fail in more
    *   extreme yet legitimate cases, such as this one:
    *
    *           +--+--+
    *           | / \ |
    *           |/   \|
    *           +     +
    *           |\   /|
    *           | \ / |
    *           +--o--+
    *
    *   The only correct algorithm I can think of requires a point that falls
    *   fully inside the outline.  While we can try finding such a point (not
    *   dissimilar to the winding algorithm), it's beyond what I'm willing to
    *   implement right now.
    */
export const even_odd = (c_endpoints: ArcEndpoint[], endpoints: ArcEndpoint[], start_index: number) => {
    let num_c_endpoints = c_endpoints.length;
    let num_endpoints = endpoints.length;
    const p = new Point(c_endpoints[0].p.x, c_endpoints[0].p.y);

    let count = 0;
    let p0 = new Point(0, 0);
    for (let i = 0; i < num_endpoints; i++) {
        const endpoint = endpoints[i];
        if (endpoint.d == GLYPHY_INFINITY) {
            p0 = new Point(endpoint.p.x, endpoint.p.y);
            continue;
        }
        const arc = new Arc(p0, endpoint.p, endpoint.d);
        p0 = new Point(endpoint.p.x, endpoint.p.y);

        /*
         * Skip our own contour
         * c_endpoints 是 endpoints 的 切片，而 start_index 是 c_endpoints 起始元素 在 endpoints 中的索引
         */
        if (i >= start_index && i < start_index + num_c_endpoints) {
            continue;
        }

        /* End-point y's compared to the ref point; lt, eq, or gt */
        const s0 = categorize(arc.p0.y, p.y);
        const s1 = categorize(arc.p1.y, p.y);

        if (is_zero(arc.d)) {
            /* Line */

            if (!s0 || !s1) {
                /*
                 * Add +.5 / -.5 for each endpoint on the halfline, depending on
                 * crossing direction.
                 */
                const t = arc.tangents();
                if (!s0 && arc.p0.x < p.x + GLYPHY_EPSILON) {
                    count += 0.5 * categorize(t.first.y, 0);
                }
                if (!s1 && arc.p1.x < p.x + GLYPHY_EPSILON) {
                    count += 0.5 * categorize(t.second.y, 0);
                }
                continue;
            }

            if (s0 == s1) {
                continue; // Segment fully above or below the halfline
            }

            // Find x pos that the line segment would intersect the half-line.
            const x = arc.p0.x + (arc.p1.x - arc.p0.x) * ((p.y - arc.p0.y) / (arc.p1.y - arc.p0.y));

            if (x >= p.x - GLYPHY_EPSILON) {
                continue; // Does not intersect halfline
            }

            count++; // Add one for full crossing
            continue;
        } else {
            /* Arc */

            if (!s0 || !s1) {
                /*
                 * Add +.5 / -.5 for each endpoint on the halfline, depending on
                 * crossing direction.
                 */
                const t = arc.tangents();

                /* Arc-specific logic:
                 * If the tangent has y==0, use the other endpoint's
                 * y value to decide which way the arc will be heading.
                 */
                if (is_zero(t.first.y)) {
                    t.first.y = +categorize(arc.p1.y, p.y);
                }
                if (is_zero(t.second.y)) {
                    t.second.y = -categorize(arc.p0.y, p.y);
                }

                if (!s0 && arc.p0.x < p.x + GLYPHY_EPSILON) {
                    count += 0.5 * categorize(t.first.y
                        , 0);
                }
                if (!s1 && arc.p1.x < p.x + GLYPHY_EPSILON) {
                    count += 0.5 * categorize(t.second.y, 0);
                }
            }

            const c = arc.center();
            const r = arc.radius();
            if (c.x - r >= p.x) {
                continue; // No chance
            }
            /* Solve for arc crossing line with y = p.y */
            const y = p.y - c.y;
            const x2 = r * r - y * y;
            if (x2 <= GLYPHY_EPSILON) {
                continue; // Negative delta, no crossing
            }
            const dx = Math.sqrt(x2);
            /* There's two candidate points on the arc with the same y as the
               * ref point. */
            const pp = [new Point(c.x - dx, p.y), new Point(c.x + dx, p.y)];

            for (let i = 0; i < pp.length; i++) {
                /* Make sure we don't double-count endpoints that fall on the
                         * halfline as we already accounted for those above */
                if (
                    !pp[i].equals(arc.p0) &&
                    !pp[i].equals(arc.p1) &&
                    pp[i].x < p.x - GLYPHY_EPSILON &&
                    arc.wedge_contains_point(pp[i])
                ) {
                    count++; // Add one for full crossing
                }
            }
        }
    }

    return !(Math.floor(count) & 1);
}

/**
 * 计算曲线的winding number
 * @note endpoints 是 all_endpoints 的 切片
 * @param start_index endpoints的起始元素在all_endpoints中的索引
 * @returns 如果修改了轮廓，则返回true
 */
export const process_contour = (endpoints: ArcEndpoint[], all_endpoints: ArcEndpoint[], inverse: boolean, start_index: number) => {
    /*
     * Algorithm:
     *
     * - Find the winding direction and even-odd number,
     * - If the two disagree, reverse the contour, inplace.
     */

    let num_endpoints = endpoints.length;
    if (!num_endpoints) {
        return false;
    }

    if (num_endpoints < 3) {
        console.error("Don't expect this");
        return false; // Need at least two arcs
    }

    if (endpoints[0].p.equals(endpoints[num_endpoints - 1].p)) {
        console.error("Don't expect this");
        return false; // Need a closed contour
    }

    let r = xor(inverse, winding(endpoints))
    r = xor(r, even_odd(endpoints, all_endpoints, start_index));

    if (r) {
        glyphy_outline_reverse(endpoints);
        return true;
    }

    return false;
}

/**
 * 用奇偶规则计算轮廓的winding number
 * @returns 如果修改了轮廓，则返回true
 */
export const glyphy_outline_winding_from_even_odd = (endpoints: ArcEndpoint[], inverse: boolean) => {
    /*
     * Algorithm:
     *
     * - Process one contour（闭合曲线）at a time.
     */

    let start = 0;
    let ret = false;
    let num_endpoints = endpoints.length;
    for (let i = 1; i < num_endpoints; i++) {
        const endpoint = endpoints[i];
        if (endpoint.d == GLYPHY_INFINITY) {
            ret = ret || process_contour(endpoints.slice(start, i), endpoints, inverse, start);
            start = i;
        }
    }
    ret = ret || process_contour(endpoints.slice(start), endpoints, inverse, start);

    return ret;
}

const categorize = (v: number, ref: number) => {
    return v < ref - GLYPHY_EPSILON ? -1 : v > ref + GLYPHY_EPSILON ? +1 : 0;
}

const is_zero = (v: number) => {
    return Math.abs(v) < GLYPHY_EPSILON;
}

