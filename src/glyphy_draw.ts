import { BlobArc, glyphy_arc_list_encode_blob2 } from "glyphy/blob.js";
import { AABB } from "glyphy/geometry/aabb.js";
import { Arc, ArcEndpoint } from "glyphy/geometry/arc.js";
import { GlyphyArcAccumulator } from "glyphy/geometry/arcs";
import { Point } from "glyphy/geometry/point.js";
import { glyphy_outline_winding_from_even_odd } from "glyphy/outline.js";
import { GLYPHY_INFINITY, assert } from "glyphy/util.js";
import { GlyphInfo } from "glyphy/vertex.js";
import * as opentype from "opentype.js";

const MIN_FONT_SIZE = 10;

const TOLERANCE = 10.0 / 1024;

const ENLIGHTEN_MAX = 0.005; /* Per EM */

const EMBOLDEN_MAX = 0.012; /* Per EM */

// 取 char对应的 arc
// 实现 encode_ft_glyph
//
export const get_char_arc = (
    gi: GlyphInfo,
    font: opentype.Font,
    char: string,
    tolerance_per_em = TOLERANCE
): {
    svg_paths: string[];
    svg_endpoints: [number, number][];
    arcs: BlobArc;
    endpoints: ArcEndpoint[];
} => {
    let upem = font.unitsPerEm;
    let tolerance = upem * tolerance_per_em; /* in font design units */
    let faraway = upem / (MIN_FONT_SIZE * Math.sqrt(2));
    let enlighten_max = upem * ENLIGHTEN_MAX;
    let embolden_max = upem * EMBOLDEN_MAX;

    let { svg_paths, svg_endpoints, endpoints } = get_endpoints(font, char, upem, tolerance);

    /**
     * 单位：Per EM
     * 值越大，划分的单元格 越多，需要的纹理空间 就越大
     * 值越小，划分的单元格 越少，单个格子的圆弧数 有可能 越多
     * 一般 字体越复杂，需要越大的数字
     */
    // const GRID_SIZE = 30; /* Per EM */
    // let grid_size = GRID_SIZE;

    let grid_size = Math.ceil(endpoints.length / 4); /* Per EM */
    grid_size = grid_size < 20 ? 20 : grid_size;

    let unit_size = upem / grid_size;

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

    gi.nominal_w = arcs.width_cells;
    gi.nominal_h = arcs.height_cells;

    gi.extents.set(extents);

    
    return { svg_paths, svg_endpoints, arcs, endpoints };
};

const get_endpoints = (
    font: opentype.Font,
    char: string,
    size: number,
    tolerance_per_em: number
): {
    svg_paths: string[];
    svg_endpoints: [number, number][];
    endpoints: ArcEndpoint[];
} => {

    {
        let radius = 30
        let p0 = new Point(radius, 0);
        let p1 = new Point(0, radius);

        console.log(`p0 = (${p0.x}, ${p0.y}), p1 = (${p1.x}, ${p1.y})`)
        for (let i = 0; i <= 16; i++) {
            let angle = i * Math.PI / 8;

            let p2 = new Point(radius * Math.cos(angle), radius * Math.sin(angle));

            let arc = Arc.from_points(p1, p0, p2, false);
            console.log(`angle = ${angle}, p2 = (${p2.x}, ${p2.y}), d = ${arc.d}`)
        }
    }

    const glyph = font.charToGlyph(char);
    const glyphPath = glyph.getPath(0, 0, size);

    let svg_paths: string[] = [];
    let svg_endpoints: [number, number][] = [];

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
    //     { type: "M", x: 1417.00, y: 0.00 },
    //     { type: "L", x: 1196.00, y: 0.00 },
    //     { type: "L", x: 1038.00, y: 424.00 },
    //     { type: "L", x: 393.00, y: 424.00 },
    //     { type: "L", x: 244.00, y: 0.00 },
    //     { type: "L", x: 23.00, y: 0.00 },
    //     { type: "L", x: 613.00, y: 1549.00 },
    //     { type: "L", x: 827.00, y: 1549.00 },
    //     { type: "L", x: 1417.00, y: 0.00 },
    //     { type: "Z" },
    //     { type: "M", x: 976.00, y: 599.00 },
    //     { type: "L", x: 742.00, y: 1243.00 },
    //     { type: "Q", x1: 731.00, y1: 1274.00, x: 718.00, y: 1351.00 },
    //     { type: "L", x: 713.00, y: 1351.00 },
    //     { type: "Q", x1: 702.00, y1: 1281.00, x: 688.00, y: 1243.00 },
    //     { type: "L", x: 456.00, y: 599.00 },
    //     { type: "L", x: 976.00, y: 599.00 },
    //     { type: "Z" }
    // ];

    for (let cmd of cmds) {
        let tx, ty, tx1, ty1;

        switch (cmd.type) {
            case "M":
                tx = cmd.x || 0;
                ty = cmd.y || 0;
                ty *= flip_y;

                if (last_point[0] !== tx || last_point[1] !== ty) {
                    last_point = [tx, ty];


                    svg_endpoints.push([tx, ty]);

                    console.log(`+ M: x = ${tx}, y = ${ty}`);
                    path_str += `M ${tx} ${ty} `;
                    accumulate.move_to(new Point(tx, ty));
                }
                break;
            case "Z":
                console.log('+ Z');
                path_str += "Z";
                svg_paths.push(path_str);

                path_str = "";
                accumulate.close_path();
                break;
            case "L":
                tx = cmd.x || 0;
                ty = cmd.y || 0;
                ty *= flip_y;

                if (last_point[0] !== tx || last_point[1] !== ty) {
                    last_point = [tx, ty];
                    svg_endpoints.push([tx, ty]);
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
                    svg_endpoints.push([tx, ty]);
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
    console.warn(`================= 02. accumulate 结果: ${accumulate.result.length}`);
    let s = []
    for (let r of accumulate.result) {
        s.push(`    { x: ${r.p.x}, y: ${r.p.y}, d: ${r.d} }`);
    }
    console.log(s.join(",\n"));
    console.log("")

    return {
        svg_paths,
        svg_endpoints,
        endpoints: accumulate.result,
    };
};

export const to_arc_cmds = (
    endpoints: ArcEndpoint[]
): [string[][], [number, number][]] => {
    let cmd = []
    let cmd_array = []
    let current_point = null;
    let pts: [number, number][] = [];
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
