const core = require('@actions/core');
const {
  ECS,
} = require('@aws-sdk/client-ecs')

async function run() {
  try {
    const imageFamily = core.getInput('imageFamily', { required: true })
    const accessKeyId = core.getInput('awsAccessKeyId', {required: true})
    const secretAccessKey = core.getInput('awsSecretAccessKey', {required: true})

    const ecsClient = new ECS({ region: 'us-west-2', credentials: {accessKeyId, secretAccessKey} })

    const listClusterResponse = await ecsClient.listClusters({ maxResults: 100 })
      const clusterArns = listClusterResponse.clusterArns
      const describeClustersResponse = await ecsClient.describeClusters({
        clusters: clusterArns,
      })
      const clusters = describeClustersResponse.clusters

      const describeServicesResponses = await Promise.all(
        clusters.map(async cluster => {
          const listServicesResponse = await ecsClient.listServices({
            cluster: cluster.clusterArn,
          })
          const serviceArns = listServicesResponse.serviceArns
          if (serviceArns.length) {
            return ecsClient.describeServices({
              cluster: cluster.clusterArn,
              services: serviceArns,
            })
          } else {
            return null
          }
        }),
      )

      const services = describeServicesResponses
        .filter(response => response !== null)
        .flatMap(response => response.services)

      const allSimplifiedServices = await Promise.all(
        services.map(async service => {
          const describeTaskDefinitionResponse = await ecsClient.describeTaskDefinition(
            {
              taskDefinition: service.taskDefinition,
            },
          )
          const taskDefinition = describeTaskDefinitionResponse.taskDefinition
          const clusterName = clusters.find(
            cluster => cluster.clusterArn === service.clusterArn,
          ).clusterName

          return {
            serviceName: service.serviceName,
            taskDefinitionFamily: taskDefinition.family,
            clusterName,
            images: taskDefinition.containerDefinitions.map(
              containerDef => containerDef.image,
            ),
            deploymentController:
              service.deploymentController && service.deploymentController.type,
          }
        }),
      )

      const regexToMatch = new RegExp(`/${imageFamily}:`)
      const filteredServices = allSimplifiedServices
        .filter(service => service.images.some(image => image.match(regexToMatch)))
      core.setOutput('services', filteredServices)
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
