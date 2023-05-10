import { Vector } from "./vector.js";
import { float_equals } from "../util.js";

export class SignedVector extends Vector {

    negative: boolean;

    constructor(x: number, y: number, negative: boolean) {
        super(x, y);
        this.negative = negative;
    }

    /**
     * 从向量 创建 SignedVector
     */
    static from_vector(v: Vector, negative: boolean) {
        return new SignedVector(v.x, v.y, negative);
    }

    /**
     * 克隆 SignedVector
     */
    clone() {
        return new SignedVector(this.x, this.y, this.negative);
    }

    /**
     * this 是否等于 sv
     */
    equals(sv: SignedVector) {
        return float_equals(this.x, sv.x)
            && float_equals(this.y, sv.y)
            && this.negative === sv.negative;
    }

    neg() {
        return SignedVector.from_vector(super.neg(), !this.negative);
    }
}