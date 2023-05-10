import { BlobArc, glyphy_arc_list_encode_blob2 } from "glyphy/blob.js";
import { AABB } from "glyphy/geometry/aabb.js";
import { Arc, ArcEndpoint, create_arc_endpoint } from "glyphy/geometry/arc.js";
import { GlyphyArcAccumulator } from "glyphy/geometry/arcs";
import { Point } from "glyphy/geometry/point.js";
import { glyphy_outline_winding_from_even_odd } from "glyphy/outline.js";
import { GLYPHY_INFINITY, assert } from "glyphy/util";
import * as opentype from "opentype.js";

const MIN_FONT_SIZE = 10;

/**
 * 单位：Per EM
 * 值越大，划分的单元格 越多，需要的纹理空间 就越大
 * 值越小，划分的单元格 越少，单个格子的圆弧数 有可能 越多
 * 一般 字体越复杂，需要越大的数字
 */
const GRID_SIZE = 20; /* Per EM */

const TOLERANCE = 1.0 / 1024;

const ENLIGHTEN_MAX = 0.01; /* Per EM */

const EMBOLDEN_MAX = 0.024; /* Per EM */

// 取 char对应的 arc
// 实现 encode_ft_glyph
//
export const get_char_arc = (
    font: opentype.Font,
    char: string,
    tolerance_per_em = TOLERANCE
): {
    path_cmds: string[];
    arcs: BlobArc;
    endpoints: ArcEndpoint[];
} => {
    let upem = font.unitsPerEm;
    let tolerance = upem * tolerance_per_em; /* in font design units */
    let faraway = upem / (MIN_FONT_SIZE * Math.sqrt(2));
    let unit_size = upem / GRID_SIZE;
    let enlighten_max = upem * ENLIGHTEN_MAX;
    let embolden_max = upem * EMBOLDEN_MAX;

    let { path_cmds, endpoints } = get_endpoints(font, char, upem, tolerance);

    if (endpoints.length > 0) {
        // 用奇偶规则，计算 每个圆弧的 环绕数
        glyphy_outline_winding_from_even_odd(endpoints, false);
    }

    console.log("")
    console.warn("============== 03. 应用奇偶规则后的结果：");
    let s = []
    for (let r of endpoints) {
        s.push(`    { x: ${r.p.x}, y: ${r.p.y}, d: ${r.d} }`);
    }
    console.log(s.join(",\n"));
    console.log("");

    let extents = new AABB();

    // 将 指令 编码
    let arcs = glyphy_arc_list_encode_blob2(
        endpoints,
        faraway,
        unit_size,
        enlighten_max,
        embolden_max,
        extents
    );

    extents.scale(1.0 / upem, 1.0 / upem);

    return { path_cmds, arcs, endpoints };
};

const get_endpoints = (
    font: opentype.Font,
    char: string,
    size: number,
    tolerance_per_em: number
): {
    path_cmds: string[];
    endpoints: ArcEndpoint[];
} => {
    const glyph = font.charToGlyph(char);
    const glyphPath = glyph.getPath(0, 0, size);

    let path_cmds: string[] = [];

    let path_str = "";
    let accumulate = new GlyphyArcAccumulator();
    accumulate.tolerance = tolerance_per_em;

    console.warn("============== 01. 原始路径：");
    let last_point = [Infinity, Infinity];

    let cmds, flip_y;

    flip_y = -1;
    cmds = glyphPath.commands;

    // flip_y = 1;
    // cmds = [
    //     { type: "M", x: 1260, y: 64 },
    //     { type: "Q", x1: 1089, y1: -26, x: 831, y: -26 },
    //     { type: "Q", x1: 498, y1: -26, x: 299, y: 185.5 },
    //     { type: "Q", x1: 100, y1: 397, x: 100, y: 745 },
    //     { type: "Q", x1: 100, y1: 1119, x: 324, y: 1347 },
    //     { type: "Q", x1: 548, y1: 1575, x: 893, y: 1575 },
    //     { type: "Q", x1: 1115, y1: 1575, x: 1260, y: 1512 },
    //     { type: "L", x: 1260, y: 1303 },
    //     { type: "Q", x1: 1094, y1: 1395, x: 895, y: 1395 },
    //     { type: "Q", x1: 636, y1: 1395, x: 473, y: 1222.5 },
    //     { type: "Q", x1: 310, y1: 1050, x: 310, y: 757 },
    //     { type: "Q", x1: 310, y1: 479, x: 462, y: 315.5 },
    //     { type: "Q", x1: 614, y1: 152, x: 860, y: 152 },
    //     { type: "Q", x1: 1090, y1: 152, x: 1260, y: 256 },
    //     { type: "L", x: 1260, y: 64 },
    //     { type: "Z" }
    // ]

    for (let cmd of cmds) {
        let tx, ty, tx1, ty1, tx2, ty2;

        switch (cmd.type) {
            case "M":
                tx = cmd.x || 0;
                ty = cmd.y || 0;
                ty = ty * flip_y;
                if (last_point[0] !== tx || last_point[1] !== ty) {
                    last_point = [tx, ty];
                    console.log(`+ M: x = ${tx}, y = ${ty}`);
                    path_str += `M ${tx} ${ty} `;
                    accumulate.move_to(new Point(tx, ty));
                }
                break;
            case "Z":
                console.log('+ Z');
                path_str += "Z";
                path_cmds.push(path_str);

                path_str = "";
                accumulate.close_path();
                break;
            case "L":
                tx = cmd.x || 0;
                ty = cmd.y || 0;
                ty = ty * flip_y;
                if (last_point[0] !== tx || last_point[1] !== ty) {
                    last_point = [tx, ty];
                    console.log(`+ L: x = ${tx}, y = ${ty}`);
                    path_str += `L ${tx} ${ty} `;
                    accumulate.line_to(new Point(tx, ty));
                }
                break;

            case "Q":
                tx = cmd.x || 0;
                ty = cmd.y || 0;
                ty = ty * flip_y;

                tx1 = cmd.x1 || 0;
                ty1 = cmd.y1 || 0;
                ty1 = ty1 * flip_y;
                if (last_point[0] !== tx || last_point[1] !== ty) {
                    last_point = [tx, ty];
                    console.log(`+ Q: x1 = ${tx1}, y1 = ${ty1}, x = ${tx}, y = ${ty}`);
                    path_str += `Q ${tx1} ${ty1}, ${tx} ${ty} `;
                    accumulate.conic_to(new Point(tx1, ty1), new Point(tx, ty));
                }
                break;
            // case "C":
            //     tx = cmd.x || 0;
            //     ty = cmd.y || 0;
            //     ty = ty * flip_y;

            //     tx1 = cmd.x1 || 0;
            //     ty1 = cmd.y1 || 0;
            //     ty1 = ty1 * flip_y;

            //     tx2 = cmd.x2 || 0;
            //     ty2 = cmd.y2 || 0;
            //     ty2 = ty2 * flip_y;

            //     if (last_point[0] !== tx || last_point[1] !== ty) {
            //         last_point = [tx, ty];
            //         console.log(`+ C: x1 = ${tx1}, y1 = ${ty1}, x2 = ${tx2}, y2 = ${ty2}, x = ${tx}, y = ${ty}`);
            //         path_str += `C ${tx1} ${ty1}, ${tx2} ${ty2}, ${tx} ${ty} `;
            //         accumulate.cubic_to(
            //             new Point(tx1, ty1),
            //             new Point(tx2, ty2),
            //             new Point(tx, ty)
            //         );
            //     }
            //     break;
        }
    };

    console.log("")
    console.warn(`================= 02. accumulate result: ${accumulate.result.length}`);
    let s = []
    for (let r of accumulate.result) {
        s.push(`    { x: ${r.p.x}, y: ${r.p.y}, d: ${r.d} }`);
    }
    console.log(s.join(",\n"));
    console.log("")

    return {
        path_cmds,
        endpoints: accumulate.result,
    };
};

export const to_arc_cmds = (
    endpoints: ArcEndpoint[]
): [string[][], number[][]] => {
    let cmd = []
    let cmd_array = []
    let current_point = null;
    let pts = [];
    for (let ep of endpoints) {
        pts.push([ep.p.x, ep.p.y]);

        if (ep.d === GLYPHY_INFINITY) {
            if (!current_point || !ep.p.equals(current_point)) {
                if (cmd.length > 0) {
                    cmd_array.push(cmd);
                    cmd = []
                }
                cmd.push(` M ${ep.p.x}, ${ep.p.y}`)
                current_point = ep.p;
            }
        } else if (ep.d === 0) {
            assert(current_point !== null);
            if (current_point && !ep.p.equals(current_point)) {
                cmd.push(` L ${ep.p.x}, ${ep.p.y}`)
                current_point = ep.p;
            }
        } else {
            assert(current_point !== null);
            if (current_point && !ep.p.equals(current_point)) {
                let arc = new Arc(current_point, ep.p, ep.d);
                let center = arc.center();
                let radius = arc.radius();
                let start_v = current_point.sub_point(center);
                let start_angle = start_v.angle();

                let end_v = ep.p.sub_point(center);
                let end_angle = end_v.angle();

                // 大于0，顺时针绘制
                let cross = start_v.cross(end_v);

                cmd.push(arcToSvgA(
                    center.x, center.y, radius,
                    start_angle, end_angle, cross < 0));

                current_point = ep.p;
            }
        }
    }
    if (cmd.length > 0) {
        cmd_array.push(cmd);
        cmd = []
    }

    return [cmd_array, pts];
};

const arcToSvgA = (x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean) => {
    // 计算圆弧结束点坐标
    let endX = x + radius * Math.cos(endAngle);
    let endY = y + radius * Math.sin(endAngle);

    // large-arc-flag 的值为 0 或 1，决定了弧线是大于还是小于或等于 180 度
    let largeArcFlag = '0' // endAngle - startAngle <= Math.PI ? '0' : '1';

    // sweep-flag 的值为 0 或 1，决定了弧线是顺时针还是逆时针方向
    let sweepFlag = anticlockwise ? '0' : '1';

    // 返回 SVG "A" 命令参数
    return `A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
}
