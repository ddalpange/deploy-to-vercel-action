const github = require('@actions/github')
const core = require('@actions/core')

const {
	GITHUB_TOKEN,
	USER,
	REPOSITORY,
	PRODUCTION,
	PR_NUMBER,
	REF,
	LOG_URL,
	PR_LABELS,
	GITHUB_DEPLOYMENT_ENV
} = require('./config')

const init = () => {
	const client = github.getOctokit(GITHUB_TOKEN, { previews: [ 'flash', 'ant-man' ] })

	let deploymentId

	const createDeployment = async () => {
		const deployment = await client.repos.createDeployment({
			owner: USER,
			repo: REPOSITORY,
			ref: REF,
			required_contexts: [],
			environment: GITHUB_DEPLOYMENT_ENV || (PRODUCTION ? 'Production' : 'Preview'),
			description: 'Deploy to Vercel',
			auto_merge: false
		})

		deploymentId = deployment.data.id

		return deployment.data
	}

	const updateDeployment = async (status, url) => {
		if (!deploymentId) return

		const deploymentStatus = await client.repos.createDeploymentStatus({
			owner: USER,
			repo: REPOSITORY,
			deployment_id: deploymentId,
			state: status,
			log_url: LOG_URL,
			environment_url: url || LOG_URL,
			description: 'Starting deployment to Vercel'
		})

		return deploymentStatus.data
	}

	const deleteExistingComment = async () => {
		const { data } = await client.issues.listComments({
			owner: USER,
			repo: REPOSITORY,
			issue_number: PR_NUMBER
		})

		if (data.length < 1) return

		const comment = data.find((comment) => comment.body.includes('This pull request has been deployed to Vercel.'))
		if (comment) {
			await client.issues.deleteComment({
				owner: USER,
				repo: REPOSITORY,
				comment_id: comment.id
			})

			return comment.id
		}
	}

	const createOrEditComment = async (commit, previewUrl, deployment) => {
		const { data } = await client.issues.listComments({
			owner: USER,
			repo: REPOSITORY,
			issue_number: PR_NUMBER
		})

		if (data.length < 1) return
		core.log('1', data)
		const previousComment = data.find((comment) => comment.body.includes(`This pull request has been deployed to Vercel.`))
		core.log('2', previousComment.body)
		core.log('3', previousComment.body_html)
		const isSameCommit = previousComment.body.includes(commit)

		if (previousComment && isSameCommit) {
			const body = previousComment.body.replace('<-- new row -->', `<tr>
			<td><code>${ deployment.id }</code></td>
			<td><a href='${ previewUrl }'>${ previewUrl }</a></td>
			<td><a href='${ deployment.inspectorUrl }'>${ deployment.inspectorUrl }</a></td>
		</tr>`)

			return await client.issues.updateComment({
				owner: USER,
				repo: REPOSITORY,
				issue_number: PR_NUMBER,
				comment_id: previousComment.id,
				body: body.replace(/^[^\S\n]+/gm, '')
			})
		}

		const body = `
						This pull request has been deployed to Vercel. ${ commit }		
						<table>
							<thead>
								<tr>
									<td><strong>Name</strong></td>
									<td><strong>Preview</strong></td>
									<td><strong>Inspect</strong></td>
								</tr>
							</thead>
							<tbody>
							</tbody>
							<tr>
								<td><code>${ deployment.id }</code></td>
								<td><a href='${ previewUrl }'>${ previewUrl }</a></td>
								<td><a href='${ deployment.inspectorUrl }'>${ deployment.inspectorUrl }</a></td>
							</tr>
							<-- new row -->
						</table>
	
						[View Workflow Logs](${ LOG_URL })
					`

		if (previousComment && !isSameCommit) {
			return await client.issues.updateComment({
				owner: USER,
				repo: REPOSITORY,
				issue_number: PR_NUMBER,
				comment_id: previousComment.id,
				body: body.replace(/^[^\S\n]+/gm, '')
			})
		}

		return await client.issues.createOrEditComment({
			owner: USER,
			repo: REPOSITORY,
			issue_number: PR_NUMBER,
			body: body.replace(/^[^\S\n]+/gm, '')
		})

	}

	const addLabel = async () => {
		const label = await client.issues.addLabels({
			owner: USER,
			repo: REPOSITORY,
			issue_number: PR_NUMBER,
			labels: PR_LABELS
		})

		return label.data
	}

	const getCommit = async () => {
		const { data } = await client.repos.getCommit({
			owner: USER,
			repo: REPOSITORY,
			ref: REF
		})

		return {
			authorName: data.commit.author.name,
			authorLogin: data.author.login,
			commitMessage: data.commit.message
		}
	}

	return {
		client,
		createDeployment,
		updateDeployment,
		deleteExistingComment,
		createOrEditComment,
		addLabel,
		getCommit
	}
}

module.exports = {
	init
}