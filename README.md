# 圆弧

+ 安装 npm i
+ 运行 npm run start 启动 开发服务器
    - http://localhost:1234 查看，支持 热更；
+ 如 出错，将 font/*.ttf 拷贝到 dist/font/*.ttf

## 1. Arc 类

+ p0, p1 起点 和 终点
    - 圆心 在 p0, p1 的 中垂线上
+ d，其绝对值等于 圆弧 圆心角 的 1/4 的 tan 值
    - 小圆弧 的 圆心角不超过 PI，所以 d = tan(x) 的 x 不超过 PI/4，所以 小弧对应的 |d| <= 1
    - 大弧 对应的 |d| > 1
+ d 的 符号 决定了 圆心的 位置；设 圆心到 p0，p1 的向量分别是 v0，v1
    -  圆心 使得 d 与 v0.cross(v1) 同号
    -  v0.cross(v1) = v0.x * v1.y - v0.y * v1.x
    - 大弧的 d符号 和 小狐相反

构造函数：

Arc.from_points(p0, p1, pm, complement) 

+ 三个点 决定了 圆心的 位置，从而决定了 d 的 正负
+ 默认都是 小狐
+ complement 决定了 用不用 大弧，大弧的d符号和小狐相反

Arc.from_center_radius_angle(center: Point, radius: number, a0: number, a1: number, complement: boolean) {

+ center, radius, a0 决定 p0
+ center, radius, a0 决定 p1
+ 圆心 是 center，所以 小狐的 d值 正负已经定下
+ complement 决定用不用大弧

