import { mat4 } from 'gl-matrix';
import { BlobArc } from 'glyphy/blob.js';
import { ArcEndpoint } from 'glyphy/geometry/arc.js';
import { GLYPHY_INFINITY } from 'glyphy/util';
import { add_glyph_vertices, GlyphInfo } from 'glyphy/vertex.js';
import { get_char_arc, to_arc_cmds } from 'glyphy_draw.js';
import * as opentype from 'opentype.js';
import { delete_glyph, set_glyph } from 'sdf/glyph.js';

/**
 * + 填充规则：奇偶规则
 * + 外围：（填充）顺时针，红-绿-蓝
 * + 内围：（挖空）逆时针，红-绿-蓝
 */
export class DrawText {
    init_x: number;
    init_y: number;
    size_x: number;
    size_y: number;

    // 鼠标上次点击的位置（相对Canvas的坐标）
    mouse_x: number | null;
    mouse_y: number | null;

    last_arc_count: number;
    last_bezier_count: number;

    last_blob_string: string;

    ctx: CanvasRenderingContext2D;
    ttf: string;
    char: string;
    char_size: number;
    font: Promise<opentype.Font> | null;

    last_arcs: BlobArc | null;

    is_render_network: boolean;
    is_render_sdf: boolean;

    is_render_bezier: boolean;
    is_fill_bezier: boolean;
    is_endpoint_bezier: boolean;

    is_render_arc: boolean;
    is_fill_arc: boolean;
    is_endpoint_arc: boolean;

    constructor(ctx: CanvasRenderingContext2D, ttf = "msyh.ttf") {
        this.init_x = 0;
        this.init_y = 0;
        this.size_x = 0;
        this.size_y = 0;

        this.mouse_x = null;
        this.mouse_y = null;

        this.last_arc_count = 0;
        this.last_bezier_count = 0;
        this.last_blob_string = "";

        this.ttf = ttf;
        this.ctx = ctx;
        this.font = null;

        this.char = "A";
        this.char_size = 256;

        this.last_arcs = null;

        this.is_render_network = true;
        this.is_render_sdf = false;

        this.is_render_bezier = true;
        this.is_fill_bezier = true;
        this.is_endpoint_bezier = true;

        this.is_render_arc = false;
        this.is_fill_arc = false;
        this.is_endpoint_arc = false;
    }

    set_mouse_down(x: number, y: number) {
        this.mouse_x = x;
        this.mouse_y = y;
        // console.warn(`mouse down: ${x}, ${y}`);
    }

    set_init_pos(x: number, y: number) {
        this.init_x = x;
        this.init_y = y;
    }

    set_init_size(x: number, y: number) {
        this.size_x = x;
        this.size_y = y;
    }

    set_render_network(is_render: boolean) {
        this.is_render_network = is_render;
    }

    set_render_sdf(is_render: boolean) {
        this.is_render_sdf = is_render;
    }

    set_render_bezier(is_render: boolean) {
        this.is_render_bezier = is_render;
    }

    set_bezier_fill(is_fill: boolean) {
        this.is_fill_bezier = is_fill;
    }

    set_bezier_endpoints(is_endpoint: boolean) {
        this.is_endpoint_bezier = is_endpoint;
    }

    set_render_arc(is_render: boolean) {
        this.is_render_arc = is_render;
    }

    set_arc_fill(is_fill: boolean) {
        this.is_fill_arc = is_fill;
    }

    set_arc_endpoints(is_endpoint: boolean) {
        this.is_endpoint_arc = is_endpoint;
    }

    set_char_size(size: number) {
        if (this.char_size !== size) {
            delete_glyph(this.char);
        }
        this.char_size = size;

        if (!this.font) {
            this.font = this.load()
        }
    }

    set_char(char: string) {
        if (this.char !== char[0]) {
            delete_glyph(this.char);
        }
        this.char = char[0];

        if (!this.font) {
            this.font = this.load()
        }
    }

    get_char() {
        return this.char;
    }

    clear() {
        let ctx = this.ctx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    draw_network_endpoints() {

        let x = this.mouse_x;
        let y = this.mouse_y;

        if (x === null || y === null) {
            return;
        }

        if (!this.is_render_network) {
            return;
        }

        if (!this.last_arcs) {
            return;
        }

        let cellSize = this.last_arcs.cell_size;


        // 计算点击位置对应的网格坐标
        x = x - this.init_x;
        y = -y + this.init_y;

        x -= this.last_arcs.extents.min_x;
        y -= this.last_arcs.extents.min_y;

        let i = Math.floor(x / cellSize);
        let j = Math.floor(y / cellSize);

        if (j < 0 || j >= this.last_arcs.data.length) {
            return;
        }

        if (i < 0 || i >= this.last_arcs.data[j].length) {
            return;
        }

        // 从arcs.data中获取对应的数据
        let unitArc = this.last_arcs.data[j][i];

        let show_data = unitArc.data;
        if (show_data.length === 1) {
            show_data = unitArc.origin_data;
        }

        let ctx = this.ctx;
        ctx.save();
        ctx.translate(this.init_x, this.init_y);
        ctx.scale(1, -1);
        for (let k = 0; k < show_data.length; k++) {
            // 注意，这里假设data中所有的元素都是ArcEndpoint类型的
            let endpoint = show_data[k] as ArcEndpoint;

            if (endpoint.d === GLYPHY_INFINITY) {
                ctx.fillStyle = 'red';
            } else if (endpoint.d === 0) {
                ctx.fillStyle = 'yellow';
            } else {
                ctx.fillStyle = 'black';
            }

            // 在端点位置画出黑点
            ctx.beginPath();

            console.log(`draw_network_endpoints: (${i}, ${j}): p = (${endpoint.p.x}, ${endpoint.p.y}), d = ${endpoint.d}`);
            ctx.arc(endpoint.p.x, endpoint.p.y, 20, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.restore();
    }

    get_arc_count() {
        return this.last_arc_count;
    }

    get_bezier_count() {
        return this.last_bezier_count;
    }

    get_blob_string() {
        return this.last_blob_string;
    }

    draw() {
        if (!this.font) {
            this.font = this.load();
        }

        this.font.then(font => {
            let size = font.unitsPerEm;
            let gi = new GlyphInfo();
            let { svg_paths, svg_endpoints, arcs, endpoints } = get_char_arc(gi, font, this.char)

            let verties = add_glyph_vertices(gi);
            console.log(`verties = `, verties);

            let tex_data = arcs.tex_data;
            if (!tex_data) {
                throw new Error(`tex_data is null`);
            }

            let g = set_glyph(this.char, verties, tex_data);
            if (!g) {
                throw new Error(`g is null`);
            }

            let scale = this.char_size * window.devicePixelRatio;
            let m = mat4.create();
            mat4.identity(m);
            mat4.translate(m, m, [25.0, 120.0, 0.0]);
            mat4.scale(m, m, [scale, scale, 1.0]);
            g.mesh?.material?.setWorldMatrix(m);

            this.last_arc_count = endpoints.length;
            this.last_bezier_count = svg_endpoints.length;
            this.last_blob_string = arcs.show;

            console.log(`svg_paths = `, svg_paths);
            console.log(`svg_endpoints = `, svg_endpoints);
            console.log(`endpoints = `, endpoints);
            console.log(`arcs = `, arcs);

            this.clear();

            if (this.is_render_bezier) {
                let is_fill = this.is_fill_bezier;
                this.draw_svg(svg_paths, this.init_x, this.init_y, size, this.size_x, this.init_x, is_fill, "red");
            }
            if (this.is_endpoint_bezier) {
                this.draw_points(svg_endpoints, this.init_x, this.init_y, "violet");
            }

            let is_fill = this.is_fill_arc;
            this.draw_arc(endpoints, this.init_x, this.init_y, size, this.size_x, this.init_x, is_fill, "green", "blue");

            if (this.is_render_network) {
                this.draw_network(arcs, this.init_x, this.init_y);
                this.draw_network_endpoints();
            }
        })
    }

    draw_network(arcs: BlobArc, x: number, y: number) {
        let ctx = this.ctx;
        let cellSize = arcs.cell_size;

        this.last_arcs = arcs;

        console.log(`=========draw_network: x = ${x}, y = ${y}, extents = (${arcs.extents.min_x}, ${arcs.extents.min_y}, ${arcs.extents.max_x}, ${arcs.extents.max_y}), w * h = (${arcs.width_cells}, ${arcs.height_cells}), size = ${cellSize}`);

        // 保存 ctx 的当前状态
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, -1);
        ctx.translate(arcs.extents.min_x, arcs.extents.min_y);

        for (let i = 0; i <= arcs.width_cells; i++) {
            let posX = i * cellSize;

            // 设置笔触样式和线宽
            ctx.strokeStyle = 'gray';
            ctx.lineWidth = 1;

            // 画竖线
            ctx.beginPath();
            ctx.moveTo(posX, 0.0);
            ctx.lineTo(posX, arcs.height_cells * cellSize);
            ctx.stroke();
        }

        for (let j = 0; j <= arcs.height_cells; j++) {
            let posY = j * cellSize;

            // 设置笔触样式和线宽
            ctx.strokeStyle = 'gray';
            ctx.lineWidth = 1;

            // 画横线
            ctx.beginPath();
            ctx.moveTo(0, posY);
            ctx.lineTo(arcs.width_cells * cellSize, posY);
            ctx.stroke();
        }

        // 设置字体大小和样式
        ctx.font = `${cellSize / 6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'black';

        // 在每个网格的中心写入数字
        for (let j = 0; j < arcs.height_cells; j++) {
            for (let i = 0; i < arcs.width_cells; i++) {
                let posX = (i + 0.5) * cellSize;
                let posY = (j + 0.5) * cellSize;
                let unit = arcs.data[j][i];

                let text = unit.show;

                ctx.save();
                ctx.scale(1, -1);
                ctx.fillText(text, posX, -posY);  // 注意这里 y 坐标的符号
                ctx.restore();
            }
        }

        // 恢复 ctx 的状态
        ctx.restore();
    }


    draw_arc(endpoints: ArcEndpoint[], x: number, y: number, size: number, w: number, init_x: number, is_fill = false, color = "green", endpoints_color = "blue") {

        let [cmds, pts] = to_arc_cmds(endpoints);

        // console.log("")
        // console.log(`============== 04. 圆弧`);
        // for (let cmd_array of cmds) {
        //     for (let cmd of cmd_array) {
        //         console.log(`    ${cmd}`);
        //     }
        // }
        // console.log("")

        let cmd_s = [];
        for (let cmd_array of cmds) {
            cmd_s.push(cmd_array.join(" "));
        }

        if (this.is_render_arc) {
            this.draw_svg(cmd_s, x, y, size, w, init_x, is_fill, color);
        }

        if (this.is_endpoint_arc) {
            this.draw_points(pts, x, y, endpoints_color)
        }
    }

    draw_points(pts: [number, number][], x: number, y: number, color = "black") {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(1, -1);
        for (let pt of pts) {
            this.ctx.beginPath();
            this.ctx.arc(pt[0], pt[1], 8, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    draw_svg(path_cmds: string[], x: number, y: number, size: number, w: number, init_x: number, is_fill = true, color = "red") {
        let paths = []
        for (let cmd of path_cmds) {
            let path = new Path2D(cmd)
            paths.push(path)
        }

        let path = new Path2D()
        for (let p of paths) {
            path.addPath(p);
        }

        this.ctx.save(); // 保存当前的上下文状态
        this.ctx.translate(x, y);
        this.ctx.scale(1, -1);
        if (is_fill) {
            this.ctx.fillStyle = color;
            this.ctx.fill(path);
        } else {
            this.ctx.strokeStyle = color;
            this.ctx.stroke(path);
        }
        this.ctx.restore();

        x += size;
        if (x > w) {
            x = init_x;
            y += size;
        }
    }

    async load() {
        return new Promise<opentype.Font>((resolve, reject) => {
            opentype.load(this.ttf, (err: Error | undefined, font: opentype.Font | undefined) => {
                if (err || !font) {
                    reject(err || new Error('Font could not be loaded.'));
                } else {
                    resolve(font);
                }
            });
        });
    }
}