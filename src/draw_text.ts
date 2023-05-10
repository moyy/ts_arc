import { BlobArc } from 'glyphy/blob.js';
import { ArcEndpoint } from 'glyphy/geometry/arc.js';
import { get_char_arc, to_arc_cmds } from 'glyphy_draw.js';
import * as opentype from 'opentype.js';

/**
 * + 填充规则：奇偶规则
 * + 外围：（填充）顺时针，红-绿-蓝
 * + 内围：（挖空）逆时针，红-绿-蓝
 */
export class DrawText {
    ctx: CanvasRenderingContext2D;
    ttf: string;
    text: string;
    font: Promise<opentype.Font> | null;
    is_fill_arc: boolean;
    is_fill_svg: boolean;
    is_draw_points: boolean;
    draw_cmd: [number, number, number, number];

    constructor(ctx: CanvasRenderingContext2D, ttf = "msyh.ttf") {
        this.ttf = ttf;
        this.ctx = ctx;
        this.font = null;
        this.text = "C";
        this.is_fill_arc = true;
        this.is_fill_svg = true;
        this.is_draw_points = true;
        this.draw_cmd = [300, 1800, 1024, 768];
    }

    set_text(char: string) {
        this.text = char;
        if (!this.font) {
            this.font = this.load()
        }
    }

    set_fill_arc(is_fill_arc: boolean) {
        this.is_fill_arc = is_fill_arc;
    }

    set_fill_svg(is_fill_svg: boolean) {
        this.is_fill_svg = is_fill_svg;
    }

    set_draw_pts(is_draw_points: boolean) {
        this.is_draw_points = is_draw_points;
    }

    redraw() {
        if (this.draw_cmd) {
            this.draw(...this.draw_cmd);
        }
    }

    clear() {
        let ctx = this.ctx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    draw(init_x = 500, init_y = 100, w = 1024, h = 768) {
        this.draw_cmd = [init_x, init_y, w, h];

        if (!this.font) {
            this.font = this.load();
        }

        this.font.then(font => {
            let size = font.unitsPerEm;
            let { path_cmds, arcs, endpoints } = get_char_arc(font, this.text)

            console.log(`cmd_types = `, path_cmds);
            console.log(`arcs = `, arcs);
            console.log(`endpoints = `, endpoints);

            this.clear();

            this.draw_svg(path_cmds, init_x, init_y, size, w, init_x, this.is_fill_svg);

            this.draw_arc(endpoints, init_x, init_y, size, w, init_x);

            this.draw_network(arcs, init_x, init_y)
        })
    }

    draw_network(arcs: BlobArc, x: number, y: number) {
        let ctx = this.ctx;
        let cellSize = arcs.cell_size;

        console.log(`=========draw_network: x = ${x}, y = ${y}, w * h = (${arcs.width_cells}, ${arcs.height_cells}), size = ${cellSize}`);

        // 保存 ctx 的当前状态
        ctx.save();
        ctx.translate(x, y);
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
                let text = arcs.data[arcs.height_cells - 1 - j][i].data.length.toString();

                ctx.fillText(text, posX, posY);
            }
        }

        // 恢复 ctx 的状态
        ctx.restore();
    }


    draw_arc(endpoints: ArcEndpoint[], x: number, y: number, size: number, w: number, init_x: number) {

        let [cmds, pts] = to_arc_cmds(endpoints);
        console.log("")
        console.warn(`============== 04. 圆弧`);
        for (let cmd_array of cmds) {
            for (let cmd of cmd_array) {
                console.log(`    ${cmd}`);
            }
        }
        console.log("")

        let cmd_s = [];
        for (let cmd_array of cmds) {
            cmd_s.push(cmd_array.join(" "));
        }

        this.draw_svg(cmd_s, x, y, size, w, init_x, this.is_fill_arc, "blue");
        if (this.is_draw_points) {
            this.draw_points(pts, x, y, "red")
        }
    }

    draw_points(pts: number[][], x: number, y: number, color = "black") {
        this.ctx.save();
        this.ctx.translate(x, y);
        for (let pt of pts) {
            this.ctx.beginPath();
            this.ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    draw_svg(path_cmds: string[], x: number, y: number, size: number, w: number, init_x: number, is_fill = true, color = "black") {
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

        return

        for (let i = 0; i < paths.length; ++i) {
            let p = paths[i]

            this.ctx.save();
            this.ctx.translate(x, y);

            this.ctx.fillStyle = 'black';
            this.ctx.fill(p);

            // let pts = paths_pts[i]

            // this.ctx.beginPath();
            // let [px, py] = pts[0]
            // this.ctx.arc(px, py, 3, 0, Math.PI * 2);
            // this.ctx.fillStyle = 'red';
            // this.ctx.fill();

            // this.ctx.beginPath();
            // [px, py] = pts[1];
            // this.ctx.arc(px, py, 3, 0, Math.PI * 2);
            // this.ctx.fillStyle = 'green';
            // this.ctx.fill();

            // this.ctx.beginPath();
            // [px, py] = pts[2];
            // this.ctx.arc(px, py, 3, 0, Math.PI * 2);
            // this.ctx.fillStyle = 'blue';
            // this.ctx.fill();

            this.ctx.restore();

            x += size;
            if (x > w) {
                x = init_x;
                y += size;
            }
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