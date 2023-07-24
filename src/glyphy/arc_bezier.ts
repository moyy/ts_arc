import { Arc, ErrorValue, tan2atan } from "./geometry/arc";
import { Bezier } from "./geometry/bezier";
import { Vector } from "./geometry/vector";
import { GLYPHY_INFINITY, assert } from "./util";


/* Returns 3 max(abs(d₀ t (1-t)² + d₁ t² (1-t)) for 0≤t≤1. */
// class MaxDeviationApproximatorExact
export const approximate_deviation = (d0: number, d1: number) => {
	let candidates = [0, 1, 0, 0];
	let num_candidates = 2;
	if (d0 == d1)
		candidates[num_candidates++] = .5;
	else {
		let delta = d0 * d0 - d0 * d1 + d1 * d1;
		let t2 = 1. / (3 * (d0 - d1));
		let t0 = (2 * d0 - d1) * t2;
		if (delta == 0)
			candidates[num_candidates++] = t0;
		else if (delta > 0) {
			/* This code can be optimized to avoid the sqrt if the solution
				* is not feasible (ie. lies outside (0,1)).  I have implemented
				* that in cairo-spline.c:_cairo_spline_bound().  Can be reused
				* here.
				*/
			let t1 = Math.sqrt(delta) * t2;
			candidates[num_candidates++] = t0 - t1;
			candidates[num_candidates++] = t0 + t1;
		}
	}

	let e = 0;
	for (let i = 0; i < num_candidates; i++) {
		let t = candidates[i];
		let ee;
		if (t < 0. || t > 1.)
			continue;
		ee = Math.abs(3 * t * (1 - t) * (d0 * (1 - t) + d1 * t));
		e = e > ee ? e : ee;
	}

	return e;
}

// class ArcBezierErrorApproximatorBehdad<MaxDeviationApproximator>
export const approximate_bezier_arc_error = (
	b0: Bezier,
	a: Arc,
	approximate_deviation: (d0: number, d1: number) => number,
) => {
	assert(b0.p0 == a.p0);
	assert(b0.p3 == a.p1);

	let ea: ErrorValue = {
		value: 0.0
	};
	let b1 = a.approximate_bezier(ea);

	assert(b0.p0 == b1.p0);
	assert(b0.p3 == b1.p3);

	let v0 = b1.p1.sub_point(b0.p1);
	let v1 = b1.p2.sub_point(b0.p2);

	let b = b0.p3.sub_point(b0.p0).normalized();
	v0 = v0.rebase_other(b);
	v1 = v1.rebase_other(b);

	let d1 = approximate_deviation(v0.x, v1.x);
	let d2 = approximate_deviation(v0.y, v1.y);
	let v = new Vector(d1, d2);

	/* Edge cases: If d*d is too close too large default to a weak bound. */
	if (a.d * a.d > 1. - 1e-4)
		return ea.value + v.len();

	/* If the wedge doesn't contain control points, default to weak bound. */
	if (!a.wedge_contains_point(b0.p1) || !a.wedge_contains_point(b0.p2))
		return ea.value + v.len();

	/* If straight line, return the max ortho deviation. */
	if (Math.abs(a.d) < 1e-6)
		return ea.value + v.y;

	/* We made sure that Math.abs(a.d) < 1 */
	let tan_half_alpha = Math.abs(tan2atan(a.d));

	let tan_v = v.x / v.y;

	let eb = 0.0;
	if (Math.abs(tan_v) <= tan_half_alpha)
		return ea.value + v.len();

	let c2 = a.p1.sub_point(a.p0).len() * .5;
	let r = a.radius();

	eb = new Vector(c2 + v.x, c2 / tan_half_alpha + v.y).len() - r;
	assert(eb >= 0);

	return ea.value + eb;
}

// export class ArcBezierApproximatorMidpointSimple
export const arc_bezier_approximator_midpoint_simple = (
	b: Bezier,
	error: ErrorValue,
	approximate_bezier_arc_error: (b: Bezier, a: Arc) => number
) => {
	let a = Arc.from_points(b.p0, b.p3, b.midpoint(), false);

	error.value = approximate_bezier_arc_error(b, a);

	return a;
}

// class ArcBezierApproximatorMidpointTwoPart
export const arc_bezier_approximator_midpoint_two_part = (
	b: Bezier,
	error: ErrorValue,
	mid_t = .5,
	approximate_bezier_arc_error: (b: Bezier, a: Arc) => number
) => {
	let pair = b.split(mid_t);
	let m = pair.second.p0;

	let a0 = Arc.from_points(b.p0, m, b.p3, true);
	let a1 = Arc.from_points(m, b.p3, b.p0, true);

	let e0 = approximate_bezier_arc_error(pair.first, a0);
	let e1 = approximate_bezier_arc_error(pair.second, a1);
	error.value = e0 > e1 ? e0 : e1;

	return Arc.from_points(b.p0, b.p3, m, false);
}

export class ArcBezierApproximatorQuantized<T extends (b: Bezier, a: Arc) => number> {
	max_d: number;
	d_bits: number;

	constructor(_max_d = GLYPHY_INFINITY, _d_bits = 0) {
		this.max_d = _max_d;
		this.d_bits = _d_bits;
	};

	approximate_bezier_with_arc(
		b: Bezier,
		error: ErrorValue,
		approximate_bezier_arc_error: T
	) {
		let mid_t = .5;
		let a = Arc.from_points(b.p0, b.p3, b.point(mid_t), false);
		let orig_a = a.clone();

		if (this.max_d < Infinity && this.max_d > -Infinity) {
			assert(this.max_d >= 0);
			if (Math.abs(a.d) > this.max_d)
				a.d = a.d < 0 ? -this.max_d : this.max_d;
		}
		if (this.d_bits && this.max_d != 0) {
			assert(this.max_d < Infinity && this.max_d > -Infinity);
			assert(Math.abs(a.d) <= this.max_d);
			let mult = (1 << (this.d_bits - 1)) - 1;
			let id = Math.round(a.d / this.max_d * mult);
			assert(-mult <= id && id <= mult);
			a.d = id * this.max_d / mult;
			assert(Math.abs(a.d) <= this.max_d);
		}

		/* Error introduced by arc quantization */
		let ed = Math.abs(a.d - orig_a.d) * a.p1.sub_point(a.p0).len() * .5;

		arc_bezier_approximator_midpoint_two_part(b, error, mid_t, approximate_bezier_arc_error);

		if (ed) {
			error.value += ed;

			/* Try a simple one-arc approx which works with the quantized arc.
				* May produce smaller error bound. */
			let e = approximate_bezier_arc_error(b, a);
			if (e < error.value) {
				error.value = e;
			}
		}

		return a;
	}
};

export const MaxDeviationApproximatorDefault = approximate_deviation;

export const ArcBezierErrorApproximatorDefault = (b0: Bezier, a: Arc) => {
	return approximate_bezier_arc_error(b0, a, MaxDeviationApproximatorDefault);
}

export const ArcBezierApproximatorDefault = (b: Bezier, error: ErrorValue, mid_t = .5) => {
	return arc_bezier_approximator_midpoint_two_part(b, error, mid_t, ArcBezierErrorApproximatorDefault)
}

export type ArcBezierApproximatorQuantizedDefault = ArcBezierApproximatorQuantized<typeof ArcBezierErrorApproximatorDefault>;

