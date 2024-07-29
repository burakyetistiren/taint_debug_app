import { Mongo } from 'meteor/mongo';

export const Paths = new Mongo.Collection('paths');
export const Edges = new Mongo.Collection('edges');
export const Libs = new Mongo.Collection('libs');
export const Nodes = new Mongo.Collection('nodes');
