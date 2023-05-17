import { GLYPHY_INFINITY } from "../util.js";
import { Point } from "./point.js";

// 包围盒
export class AABB {
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;

    constructor(min_x = GLYPHY_INFINITY, min_y = GLYPHY_INFINITY, max_x = -GLYPHY_INFINITY, max_y = -GLYPHY_INFINITY) {
        this.min_x = min_x;
        this.min_y = min_y;

        this.max_x = max_x;
        this.max_y = max_y;
    }

    clear() {
        this.min_x = GLYPHY_INFINITY;
        this.min_y = GLYPHY_INFINITY;

        this.max_x = -GLYPHY_INFINITY;
        this.max_y = -GLYPHY_INFINITY;
    }

    clone() {
        return new AABB(this.min_x, this.min_y, this.max_x, this.max_y);
    }

    set(other: AABB) {
        this.min_x = other.min_x;
        this.min_y = other.min_y;

        this.max_x = other.max_x;
        this.max_y = other.max_y;
    }

    is_empty() {
        // 当最小值是无穷时，包围盒是空的
        return this.min_x === GLYPHY_INFINITY || this.min_x === -GLYPHY_INFINITY;
    }

    /**
     * 包围盒添加 一个点
     */
    add(p: Point) {
        // 空的时候，最小最大值都是那个点
        if (this.is_empty()) {
            this.min_x = this.max_x = p.x;
            this.min_y = this.max_y = p.y;
            return;
        }

        this.min_x = p.x < this.min_x ? p.x : this.min_x;
        this.min_y = p.y < this.min_y ? p.y : this.min_y;

        this.max_x = p.x > this.max_x ? p.x : this.max_x;
        this.max_y = p.y > this.max_y ? p.y : this.max_y;
    }

    // 合并 包围盒
    extend(other: AABB) {
        // 对方是空，就是自己
        if (other.is_empty()) {
            return;
        }

        // 自己是空，就是对方
        if (this.is_empty()) {
            this.set(other);
            return;
        }

        this.min_x = this.min_x < other.min_x ? this.min_x : other.min_x;
        this.min_y = this.min_y < other.min_y ? this.min_y : other.min_y;
        this.max_x = this.max_x > other.max_x ? this.max_x : other.max_x;
        this.max_y = this.max_y > other.max_y ? this.max_y : other.max_y;
    }

    // 判断 是否包含点
    includes(p: Point) {
        return this.min_x <= p.x
            && p.x <= this.max_x
            && this.min_y <= p.y
            && p.y <= this.max_y;
    }

    // 缩放
    scale(x_scale: number, y_scale: number) {
        this.min_x *= x_scale;
        this.max_x *= x_scale;
        this.min_y *= y_scale;
        this.max_y *= y_scale;
    }
}