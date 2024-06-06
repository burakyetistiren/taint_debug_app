import { Mongo } from 'meteor/mongo';

export const Paths = new Mongo.Collection('paths');
export const Libs = new Mongo.Collection('libs');
export const Nodes = new Mongo.Collection('nodes');