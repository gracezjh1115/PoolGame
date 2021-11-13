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
        this.walls = [];
        this.walls.push([vec3(15, -8, -25), vec3(15, -8, 25), vec3(15, -2, 25), vec3(15, -2, -25)]);
        this.walls.push([vec3(-15, -8, -25), vec3(-15, -8, 25), vec3(-15, -2, 25), vec3(-15, -2, -25)]);
        this.walls.push([vec3(-15, -8, -25), vec3(15, -8, -25), vec3(15, -2, -25), vec3(-15, -2, -25)]);
        this.walls.push([vec3(-15, -8, 25), vec3(15, -8, 25), vec3(15, -2, 25), vec3(-15, -2, 25)]);
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
            if (object_earliest.dt < dt && re.dt < dt) {
                console.log(re,object_earliest,ball.center)
                let ball2 = ball
                ball2.linear_velocity = object_earliest.velocity
                ball2.center = object_earliest.position
            }
            if (re.dt < object_earliest.dt) object_earliest = re
        }
        return object_earliest
    }
}
