import {defs, tiny} from './common.js';

// Pull these names into this module's scope for convenience:
const {vec3, unsafe3, vec4, color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;

const BALL_COLLISION_ITER = 1

export class Body {
    // **Body** can store and update the properties of a 3D body that incrementally
    // moves from its previous place due to velocities.  It conforms to the
    // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
    constructor(shape, material, size, weight=0, rolling_friction=0) {
        Object.assign(this,
            {shape, material, size, weight, rolling_friction})
        this.center = vec3(0, 0, 0);
        this.rotation = Mat4.identity();
        this.linear_velocity = vec3(0, 0, 0);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy(), linear_velocity: this.linear_velocity.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = Mat4.identity();
        this.temp_matrix = Mat4.identity();
        Object.assign(this, {angular_velocity: 0, spin_axis: vec3(1, 0, 0)})
    }

    // (within some margin of distance).
    static intersect_cube(p, margin = 0) {
        return p.every(value => value >= -1 - margin && value <= 1 + margin)
    }

    static intersect_sphere(p, margin = 0) {
        return p.dot(p) < 1 + margin;
    }

    // emplace(): assign the body's initial values, or overwrite them.
    emplace(location_matrix, linear_velocity, angular_velocity, spin_axis = vec3(0, 0, 0).randomized(1).normalized()) {
        this.center = location_matrix.times(vec4(0, 0, 0, 1)).to3();
        this.rotation = Mat4.translation(...this.center.times(-1)).times(location_matrix);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = location_matrix;
        this.temp_matrix = Mat4.identity();
        return Object.assign(this, {linear_velocity, angular_velocity, spin_axis})
    }

    compute_state_at(time_amount) {
        let position = this.center, velocity = this.linear_velocity

        // Linear velocity first
        if (this.linear_velocity.norm() > 1e-10) {
            if (this.rolling_friction * time_amount >= this.linear_velocity.norm()) {
                let stop_time = this.linear_velocity.norm() / this.rolling_friction;

                //center: p = p0 + v0*t + 0.5*at^2
                position = this.center.plus(this.linear_velocity.times(stop_time))
                    .plus(this.linear_velocity.normalized().times(-this.rolling_friction * stop_time * stop_time));
                // velocity: v = v0 + at
                velocity = vec3(0, 0, 0)

                return {position, velocity, stop_time}
            } else {
                //center: p = p0 + v0*t + 0.5*at^2
                position = this.center.plus(this.linear_velocity.times(time_amount))
                    .plus(this.linear_velocity.normalized().times(-this.rolling_friction * time_amount * time_amount));

                velocity = this.linear_velocity.minus(this.linear_velocity.normalized().times(this.rolling_friction * time_amount))
            }
        }

        return {position, velocity, stop_time: null}
    }

    set_previous() {
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy(), linear_velocity: this.linear_velocity.copy()};
    }

    advance(time_amount, set_previous = true) {
        // advance(): Perform an integration (the simplistic Forward Euler method) to
        // advance all the linear and angular velocities one time-step forward.
        if (set_previous) this.set_previous()
        // Apply the velocities scaled proportionally to real time (time_amount):

        // Linear velocity first
        let new_state = this.compute_state_at(time_amount)
        this.center = new_state.position
        this.linear_velocity = new_state.velocity

        //angular velocity
        this.rotation.pre_multiply(Mat4.rotation(time_amount * this.angular_velocity, ...this.spin_axis));
    }

    // The following are our various functions for testing a single point,
    // p, against some analytically-known geometric volume formula

    blend_rotation(alpha) {
        // blend_rotation(): Just naively do a linear blend of the rotations, which looks
        // ok sometimes but otherwise produces shear matrices, a wrong result.

        // TODO:  Replace this function with proper quaternion blending, and perhaps
        // store this.rotation in quaternion form instead for compactness.
        return this.rotation.map((x, i) => vec4(...this.previous.rotation[i]).mix(x, alpha));
    }

    blend_state(alpha) {
        // blend_state(): Compute the final matrix we'll draw using the previous two physical
        // locations the object occupied.  We'll interpolate between these two states as
        // described at the end of the "Fix Your Timestep!" blog post.
        this.drawn_location = Mat4.translation(...this.previous.center.mix(this.center, alpha))
            .times(this.blend_rotation(alpha))
            .times(Mat4.scale(...this.size));
    }

    check_if_colliding(b, collider) {
        // check_if_colliding(): Collision detection function.
        // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
        // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
        // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
        // hack (there are perfectly good analytic expressions that can test if two ellipsoids
        // intersect without discretizing them into points).
        if (this == b)
            return false;
        // Nothing collides with itself.
        // Convert sphere b to the frame where a is a unit sphere:
        const T = this.inverse.times(b.drawn_location, this.temp_matrix);

        const {intersect_test, points, leeway} = collider;
        // For each vertex in that b, shift to the coordinate frame of
        // a_inv*b.  Check if in that coordinate frame it penetrates
        // the unit sphere at the origin.  Leave some leeway.
        return points.arrays.position.some(p =>
            intersect_test(T.times(p.to4(1)).to3(), leeway));
    }

    /**
     * the boundary checking algorithm for sphere
     * @param boundary the array of vec3 representing the boundary polygon
     * @param dt the time to check
     */
    check_if_colliding_boundary(boundary, dt) {
        let this_r = Math.max(this.size[0], this.size[1], this.size[2])
        let boundary_normal = boundary[1].minus(boundary[0]).cross(boundary[2].minus(boundary[1])).normalized()
        if (this.center.minus(boundary[0]).dot(boundary_normal) < 0) boundary_normal = boundary_normal.times(-1); // face this object
        let moved_polygon = boundary.map((e) => e.plus(boundary_normal.times(this_r)));

        let no_collision_end_state = this.compute_state_at(dt)
        if (no_collision_end_state.position.minus(moved_polygon[0]).dot(boundary_normal) > 0) return false; //did not cross boundary's plane

        //intersection point
        let begin_height = this.center.minus(moved_polygon[0]).dot(boundary_normal)
        let end_height = - no_collision_end_state.position.minus(moved_polygon[0]).dot(boundary_normal)
        let intersection_point = this.center.times(begin_height / (begin_height + end_height)).plus(no_collision_end_state.position.times(end_height / (begin_height + end_height)))

        //in polygon check
        let sign = moved_polygon[0].minus(moved_polygon[moved_polygon.length - 1]).cross(intersection_point.minus(moved_polygon[moved_polygon.length - 1])).dot(boundary_normal)
        for (let i = 0; i < moved_polygon.length - 1; i ++) {
            let second_sign = moved_polygon[i + 1].minus(moved_polygon[i]).cross(intersection_point.minus(moved_polygon[i])).dot(boundary_normal)
            if (second_sign * sign <= 0) return false;
        }
        return true;
    }

    /**
     * the boundary collision algorithm for sphere
     * @param boundary the array of vec3 representing the boundary polygon
     * @param dt the time to run
     */
    boundary_collision(boundary, dt) {
        let this_r = Math.max(this.size[0], this.size[1], this.size[2])
        let boundary_normal = boundary[1].minus(boundary[0]).cross(boundary[2].minus(boundary[1])).normalized()
        if (this.center.minus(boundary[0]).dot(boundary_normal) < 0) boundary_normal = boundary_normal.times(-1); // face this object
        let moved_polygon = boundary.map((e) => e.plus(boundary_normal.times(this_r)));

        let no_collision_end_state = this.compute_state_at(dt)
        if (this.linear_velocity.dot(boundary_normal) > 0) return {...no_collision_end_state, dt}; //going out of the plane, no collision
        if (no_collision_end_state.position.minus(moved_polygon[0]).dot(boundary_normal) > 0) return {...no_collision_end_state, dt}; //did not cross boundary's plane

        //intersection point
        let begin_height = this.center.minus(moved_polygon[0]).dot(boundary_normal)
        let end_height = - no_collision_end_state.position.minus(moved_polygon[0]).dot(boundary_normal)
        let intersection_point = this.center.times(end_height / (begin_height + end_height)).plus(no_collision_end_state.position.times(begin_height / (begin_height + end_height)))

        //in polygon check
        let sign = moved_polygon[0].minus(moved_polygon[moved_polygon.length - 1]).cross(intersection_point.minus(moved_polygon[moved_polygon.length - 1])).dot(boundary_normal)
        for (let i = 0; i < moved_polygon.length - 1; i ++) {
            let second_sign = moved_polygon[i + 1].minus(moved_polygon[i]).cross(intersection_point.minus(moved_polygon[i])).dot(boundary_normal)
            if (second_sign * sign <= 0) return {...no_collision_end_state, dt};
        }

        let intersection_speed = Math.sqrt(this.linear_velocity.dot(this.linear_velocity) - 2 * this.rolling_friction * (intersection_point.minus(this.center).norm()))
        let velocity_direction = this.linear_velocity.normalized()
        velocity_direction = velocity_direction.minus(boundary_normal.times(2 * velocity_direction.dot(boundary_normal)))
        let result_velocity = velocity_direction.times(intersection_speed)

        let intersection_dt = (intersection_point.minus(this.center).norm()) / (this.linear_velocity.norm() + intersection_speed) * 2

        return {position: intersection_point, velocity: result_velocity, stop_time: null, dt: intersection_dt}
    }

    /**
     * the boundary edge collision algorithm for sphere
     * @param edge the array of vec3 representing the boundary polygon
     * @param dt the time to run
     */
    edge_collision(edge, dt) {
        let this_r = Math.max(this.size[0], this.size[1], this.size[2])
        let no_collision_end_state = {...this.compute_state_at(dt), dt}

        let edge_direction = edge[1].minus(edge[0]).normalized()
        let edge_to_velocity = edge_direction.cross(this.linear_velocity).normalized()
        let closest_distance = this.center.minus(edge[0]).dot(edge_to_velocity)
        if (Math.abs(closest_distance) > this_r) return no_collision_end_state

        let edge_collision_point = edge[0].plus(edge_direction.times(this.center.minus(edge[0]).dot(edge_direction)))
        let collision_point_to_closest_position = edge_to_velocity.times(closest_distance)
        let unit_velocity = this.linear_velocity.normalized()
        let closest_position = this.center.plus(unit_velocity.times(edge[0].minus(this.center).dot(unit_velocity)))
        let collision_ball_center_to_closest_point_len = Math.sqrt(this_r * this_r - closest_distance * closest_distance)
        let collision_ball_center = closest_position.minus(unit_velocity.times(collision_ball_center_to_closest_point_len))

        if (no_collision_end_state.position.minus(collision_ball_center).dot(collision_ball_center.minus(this.center)) > 0) { //closest position between the trajectory
            return no_collision_end_state
        }

        //construct a surface then return the collision result
        let surface_normal = collision_ball_center.minus(edge_collision_point)
        let second_plane_direction = edge_direction.cross(surface_normal).normalized()
        return this.boundary_collision([edge_collision_point.minus(edge_direction).minus(second_plane_direction),
                                                 edge_collision_point.minus(edge_direction).plus(second_plane_direction),
                                                 edge_collision_point.plus(edge_direction).plus(second_plane_direction),
                                                 edge_collision_point.plus(edge_direction).minus(second_plane_direction)], dt)
    }

    static ball_collision_time_iter(ballA, ballB, dt) {
        //solve collision time
        //norm( p + vt - p' - v't ) = r + r'
        let deltaP = ballA.position.minus(ballB.position)
        let deltaV = ballA.velocity.minus(ballB.velocity)
        let equation_a = deltaV.dot(deltaV)
        let equation_b = 2 * deltaP.dot(deltaV)
        let equation_c = deltaP.dot(deltaP) - (ballA.radius + ballB.radius) ** 2
        let equation_delta = equation_b ** 2 - 4 * equation_a * equation_c
        if (equation_delta <= 0) return null;
        let t_1 = (- equation_b - Math.sqrt(equation_delta)) / (2 * equation_a)
        let t_2 = (- equation_b + Math.sqrt(equation_delta)) / (2 * equation_a)
        if (t_1 < 0 || t_2 < 0 || t_1 > dt) return null;
        return t_1;
    }

    /**
     * https://stackoverflow.com/questions/35211114/2d-elastic-ball-collision-physics
     * @param otherBall:Body
     * @param dt
     */
    ball_collision(otherBall, dt) {
        let this_r = Math.max(this.size[0], this.size[1], this.size[2])
        let otherBall_r = Math.max(otherBall.size[0], otherBall.size[1], otherBall.size[2])
        let no_collision_end_state = {...this.compute_state_at(dt), dt}

        //solve collision time
        //norm( p + vt - p' - v't ) = r + r'
        let t = 0;
        let this_ball_state = {position: this.center, velocity: this.linear_velocity, radius: this_r}
        let other_ball_state = {position: otherBall.center, velocity: otherBall.linear_velocity, radius: otherBall_r}
        for (let i = 0; i < BALL_COLLISION_ITER; i ++) {
            const next_point_t = Body.ball_collision_time_iter(this_ball_state, other_ball_state, dt);
            if (next_point_t === null) return no_collision_end_state;
            t += next_point_t
            const this_ball_next_state = this.compute_state_at(t)
            this_ball_state.position = this_ball_next_state.position
            this_ball_state.velocity = this_ball_next_state.velocity
            const other_ball_next_state = otherBall.compute_state_at(t)
            other_ball_state.position = other_ball_next_state.position
            other_ball_state.velocity = other_ball_next_state.velocity
            if ((this_ball_next_state.stop_time !== null && this_ball_next_state.stop_time < t) ||
                (other_ball_next_state.stop_time !== null && other_ball_next_state.stop_time < t)) {
                return no_collision_end_state
            }
        }

        //forward to collision
        let deltaP = this_ball_state.position.minus(other_ball_state.position)
        let deltaV = this_ball_state.velocity.minus(other_ball_state.velocity)
        const this_ball_result_velocity = this_ball_state.velocity.minus(deltaP.times(deltaV.dot(deltaP) / deltaP.dot(deltaP)))
        deltaP = other_ball_state.position.minus(this_ball_state.position)
        deltaV = other_ball_state.velocity.minus(this_ball_state.velocity)
        const other_ball_result_velocity = other_ball_state.velocity.minus(deltaP.times(deltaV.dot(deltaP) / deltaP.dot(deltaP)))

        return {dt: t, velocity: this_ball_result_velocity, position: this_ball_state.position, stop_time: null,
            other: {body: otherBall, dt: t, velocity: other_ball_result_velocity, position: other_ball_state.position, stop_time: null}}
    }
}
