'use strict';

module.exports = function (grunt) {
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        clean: {
            dist: ['dist/**']
        },
        babel: {
            options: {
                sourceMap: false
            },
            dist: {
                files: [{
                    expand: true,
                    src: ['src/**/*.js'],
                    dest: 'dist/'
                }]
            }
        }
    });

    grunt.registerTask('build', [
        'clean',
        'babel'
    ]);

    grunt.registerTask('default', [
        'build'
    ]);
};
