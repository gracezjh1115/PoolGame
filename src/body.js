import {defs, tiny} from './common.js';

// Pull these names into this module's scope for convenience:
const {vec3, unsafe3, vec4, color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;

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
        let intersection_point = this.center.times(begin_height / (begin_height + end_height)).plus(no_collision_end_state.position.times(end_height / (begin_height + end_height)))

        let intersection_speed = Math.sqrt(this.linear_velocity.dot(this.linear_velocity) - 2 * this.rolling_friction * (intersection_point.minus(this.center).norm()))
        let velocity_direction = this.linear_velocity.normalized()
        velocity_direction = velocity_direction.minus(boundary_normal.times(2 * velocity_direction.dot(boundary_normal)))
        let result_velocity = velocity_direction.times(intersection_speed)

        let intersection_dt;
        if (this.rolling_friction > 1e-10) intersection_dt = (this.linear_velocity.norm() - intersection_speed) / this.rolling_friction
        else intersection_dt = (intersection_point.minus(this.center).norm()) / this.linear_velocity.norm()

        return {position: intersection_point, velocity: result_velocity, stop_time: null, dt: intersection_dt}
    }

    //https://stackoverflow.com/questions/35211114/2d-elastic-ball-collision-physics
}
