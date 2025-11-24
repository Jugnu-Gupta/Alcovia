# n8n Workflow Setup Guide

## Overview
This folder contains the n8n workflow configuration for the Alcovia Intervention Engine's mentor notification system.

## Files
- `mentor-intervention-workflow.json` - The complete n8n workflow that handles student failure notifications and mentor responses

## Workflow Description

### Triggers and Flow:
1. **Student Failure Webhook** - Receives notification when a student fails daily check-in
2. **Generate Token** - Creates a unique token for security
3. **Generate Intervention Link** - Creates mentor action URLs
4. **Send Email Notification** - Sends email to mentor with student details and action buttons
5. **Wait for Mentor Response** - The workflow pauses here waiting for mentor action
6. **Route Mentor Decision** - Handles different mentor choices (assign task, auto-unlock)
7. **Backend Update** - Calls the backend API to update student status and assign intervention

### Setup Instructions:

#### 1. Import the Workflow
1. Open your n8n instance (cloud or self-hosted)
2. Go to Workflows and click "Import from file"
3. Upload the `mentor-intervention-workflow.json` file
4. The workflow will be imported with all nodes configured

#### 2. Configure Email Service
The workflow uses EmailJS for sending notifications. You need to:
1. Sign up for EmailJS account at https://emailjs.com
2. Create an email service and template
3. Update the following in the "Send Email Notification" node:
   - `YOUR_SERVICE_ID` - Your EmailJS service ID
   - `YOUR_PUBLIC_KEY` - Your EmailJS public key
   - Update the template to match your email template ID

#### 3. Update Webhook URLs
1. Copy the webhook URL from the "Webhook - Student Failure" node
2. Update your backend server's `N8N_WEBHOOK_URL` environment variable with this URL
3. Copy the webhook URL from the "Webhook - Mentor Action" node for mentor responses

#### 4. Configure Backend Integration
Update the following in relevant nodes:
- Backend API URL (if not localhost:5000)
- Any authentication headers required by your backend

#### 5. Test the Workflow
1. Activate the workflow in n8n
2. Test by submitting a poor performance via the student app
3. Check that email notification is sent
4. Click on the action buttons in the email to test mentor responses

## Email Template Example

Create an email template in EmailJS with the following variables:
- `{{student_id}}` - Student identifier
- `{{quiz_score}}` - Quiz score (1-10)
- `{{focus_minutes}}` - Focus time in minutes
- `{{timestamp}}` - When the failure occurred
- `{{intervention_link}}` - Link for mentor actions

## Security Features

- Unique tokens are generated for each intervention request
- Mentor action links expire after use
- Backend validates intervention tokens
- Auto-unlock failsafe after timeout

## Customization Options

### Timeout Duration
Change the "Wait for Mentor Response" node duration (currently 5 minutes) to adjust auto-unlock timing.

### Email Provider
Replace EmailJS with any email service (SendGrid, Mailgun, etc.) by updating the HTTP request node.

### Slack Integration (Alternative)
Replace email notification with Slack webhook for team notifications.

### Additional Actions
Add more intervention options by:
1. Adding more buttons to the email template
2. Extending the "Route Mentor Decision" node
3. Adding corresponding backend API calls

## Troubleshooting

### Common Issues:
1. **Email not sending**: Check EmailJS configuration and API keys
2. **Backend not receiving webhooks**: Verify webhook URLs and backend server status
3. **Auto-unlock not working**: Check the wait node duration and backend API endpoint

### Logging:
Enable execution logging in n8n to debug workflow issues. Each node execution will show request/response data.

## Production Considerations

1. **Rate Limiting**: Implement rate limiting for webhook endpoints
2. **Authentication**: Add proper authentication for production webhooks
3. **Monitoring**: Set up monitoring for workflow execution failures
4. **Backup**: Regular backup of workflow configurations
5. **Scaling**: Consider using n8n cloud for high-volume scenarios

## Integration with Frontend

The frontend (React app) automatically receives real-time updates via WebSocket when:
- Student status changes from mentor actions
- Intervention tasks are assigned
- Students are unlocked

This creates a seamless experience where mentor actions immediately reflect in the student interface.