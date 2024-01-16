#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BackendStack } from "../stacks/backend-stack";
import { S3Stack } from "../stacks/s3-stack";
import { DatabaseStack } from "../stacks/database-stack";
import { AuthStack } from "../stacks/auth-stack";
import { ComputeStack } from "../stacks/compute-stack";

const app = new cdk.App();
new BackendStack(app, "BackendStack", {});
const s3Stack = new S3Stack(app, "S3Stack", {});
const databaseStack = new DatabaseStack(app, "DatabaseStack", {});
const authStack = new AuthStack(app, "AuthStack", {});
const computeStack = new ComputeStack(app, "ComputeStack", {
  mediaBucket: s3Stack.mediaBucket,
  contentTable: databaseStack.contentTable,
});
