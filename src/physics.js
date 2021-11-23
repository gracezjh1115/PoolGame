import {Body} from "./body.js";
import {defs, tiny} from './common.js';

// Pull these names into this module's scope for convenience:
const {vec3, unsafe3, vec4, color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;


// simple physics model
// we assume that only object in contact can exert a force on each other 
export class Physics {
    constructor()
    {
        this.g = 9.81;

        this.bodies = [];

        //sides
        this.walls = [];
        this.walls.push([vec3(15, -8, -25), vec3(15, -8, -2), vec3(15, -2, -2), vec3(15, -2, -25)]);
        this.walls.push([vec3(15, -8, 2), vec3(15, -8, 25), vec3(15, -2, 25), vec3(15, -2, 2)]);
        this.walls.push([vec3(-15, -8, -25), vec3(-15, -8, -2), vec3(-15, -2, -2), vec3(-15, -2, -25)]);
        this.walls.push([vec3(-15, -8, 2), vec3(-15, -8, 25), vec3(-15, -2, 25), vec3(-15, -2, 2)]);
        this.walls.push([vec3(-15, -8, -25), vec3(15, -8, -25), vec3(15, -2, -25), vec3(-15, -2, -25)]);
        this.walls.push([vec3(-15, -8, 25), vec3(15, -8, 25), vec3(15, -2, 25), vec3(-15, -2, 25)]);

        //pocket sides
        this.walls.push([vec3(17, -8, -2), vec3(15, -8, -2), vec3(15, -2, -2), vec3(17, -2, -2)]);
        this.walls.push([vec3(17, -8,  2), vec3(15, -8,  2), vec3(15, -2,  2), vec3(17, -2,  2)]);
        this.walls.push([vec3(-17, -8, -2), vec3(-15, -8, -2), vec3(-15, -2, -2), vec3(-17, -2, -2)]);
        this.walls.push([vec3(-17, -8,  2), vec3(-15, -8,  2), vec3(-15, -2,  2), vec3(-17, -2,  2)]);

        this.edges = this.get_wall_vertical_edges()
    }

    get_wall_vertical_edges() {
        let edges = []
        for (let w of this.walls) {
            edges.push([w[w.length - 1], w[0]])
            for (let i = 0; i < w.length - 1; i ++)
                edges.push([w[i], w[i + 1]])
        }

        edges = edges.filter(e => e[0][0] === e[1][0] && e[0][1] !== e[1][1] && e[0][2] === e[1][2])
        edges.forEach(e => {e.sort((a, b) => a[1] - b[1])})
        edges = edges.filter(function(item, pos) {
            for (let i = 0; i < pos; i ++) {
                if (edges[i][0].equals(item[0]) && edges[i][1].equals(item[1])) return false;
            }
            return true;
        })
        return edges
    }
    
    // update the state of the two ball involve in a collision
    static resolve_ball_ball_collision(a, b)
    {
        let a_center = a.center;
        let b_center = b.center;

    }

    // update the state of the ball involve in a collision with a wall
    static resolve_ball_wall_collision(ball, wall)
    {
        
    }

    /**
     * if there is a collision, return info of that collision
     * otherwise, return the info at the end of dt.
     * @param ball the body in simulation
     * @param dt the time step
     * @returns {{dt: number, position: vec3, velocity: vec3, stop_time: null | number}} the body translational kinematics information
     */
    get_earliest_collision_info(ball, dt) {
        let object_earliest = {dt: dt * 2}
        for (let w of this.walls) {
            let re = ball.boundary_collision(w, dt);
            if (re.dt < object_earliest.dt) object_earliest = re
        }
        for (let e of this.edges) {
            let re = ball.edge_collision(e, dt);
            if (re.dt < object_earliest.dt) object_earliest = re
        }
        for (let b of this.bodies) {
            let re = ball.ball_collision(b, dt);
            if (re.dt < object_earliest.dt) object_earliest = re
        }
        return object_earliest
    }
}
