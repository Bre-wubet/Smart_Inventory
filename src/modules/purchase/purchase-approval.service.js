const { prisma } = require('../../config/db');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { POStatus, Role } = require('../../core/constants');

async function createApprovalWorkflow(purchaseOrderId, tenantId, workflowData) {
  const { approvers, approvalType = 'SEQUENTIAL', requiredApprovals = 1 } = workflowData;

  // Verify purchase order exists and is pending
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, name: true, sku: true, cost: true }
          }
        }
      }
    }
  });

  if (!purchaseOrder) {
    throw new NotFoundError('Purchase order not found');
  }

  if (purchaseOrder.status !== POStatus.PENDING) {
    throw new ValidationError('Only pending purchase orders can have approval workflows');
  }

  // Calculate total value for approval thresholds
  const totalValue = purchaseOrder.items.reduce((sum, item) => 
    sum + (parseFloat(item.quantity) * parseFloat(item.unitCost)), 0
  );

  // Determine approval requirements based on value
  const approvalRequirements = determineApprovalRequirements(totalValue, requiredApprovals);

  // Create approval workflow
  const workflow = await prisma.$transaction(async (tx) => {
    // Create workflow record
    const createdWorkflow = await tx.approvalWorkflow.create({
      data: {
        purchaseOrderId,
        tenantId,
        approvalType,
        requiredApprovals: approvalRequirements.length,
        totalValue,
        status: 'PENDING',
        createdAt: new Date()
      }
    });

    // Create approval steps
    const approvalSteps = await Promise.all(
      approvalRequirements.map((requirement, index) => 
        tx.approvalStep.create({
          data: {
            workflowId: createdWorkflow.id,
            stepOrder: index + 1,
            requiredRole: requirement.role,
            minValue: requirement.minValue,
            maxValue: requirement.maxValue,
            status: 'PENDING',
            createdAt: new Date()
          }
        })
      )
    );

    // Assign approvers to steps
    for (let i = 0; i < approvalSteps.length; i++) {
      const step = approvalSteps[i];
      const stepApprovers = approvers.filter(approver => 
        approver.role === step.requiredRole
      );

      if (stepApprovers.length === 0) {
        throw new ValidationError(`No approvers found for role: ${step.requiredRole}`);
      }

      await Promise.all(
        stepApprovers.map(approver =>
          tx.approvalAssignment.create({
            data: {
              stepId: step.id,
              userId: approver.userId,
              role: approver.role,
              assignedAt: new Date()
            }
          })
        )
      );
    }

    return {
      ...createdWorkflow,
      steps: approvalSteps
    };
  });

  return workflow;
}

function determineApprovalRequirements(totalValue, requiredApprovals) {
  const requirements = [];

  // Define approval thresholds
  const thresholds = [
    { minValue: 0, maxValue: 1000, role: Role.USER },
    { minValue: 1000, maxValue: 5000, role: Role.MANAGER },
    { minValue: 5000, maxValue: 50000, role: Role.MANAGER },
    { minValue: 50000, maxValue: Infinity, role: Role.ADMIN }
  ];

  // Find applicable thresholds
  const applicableThresholds = thresholds.filter(threshold => 
    totalValue >= threshold.minValue && totalValue < threshold.maxValue
  );

  // Create requirements based on value and required approvals
  if (totalValue < 1000) {
    requirements.push({ minValue: 0, maxValue: 1000, role: Role.USER });
  } else if (totalValue < 5000) {
    requirements.push({ minValue: 1000, maxValue: 5000, role: Role.MANAGER });
  } else if (totalValue < 50000) {
    requirements.push({ minValue: 5000, maxValue: 50000, role: Role.MANAGER });
    if (requiredApprovals > 1) {
      requirements.push({ minValue: 5000, maxValue: 50000, role: Role.ADMIN });
    }
  } else {
    requirements.push({ minValue: 50000, maxValue: Infinity, role: Role.ADMIN });
    if (requiredApprovals > 1) {
      requirements.push({ minValue: 50000, maxValue: Infinity, role: Role.MANAGER });
    }
  }

  return requirements.slice(0, requiredApprovals);
}

async function approveStep(stepId, userId, approvalData) {
  const { comments = '', conditions = [] } = approvalData;

  // Verify step exists and user is assigned
  const step = await prisma.approvalStep.findFirst({
    where: { id: stepId },
    include: {
      workflow: {
        include: {
          purchaseOrder: {
            select: { id: true, reference: true, status: true }
          }
        }
      },
      assignments: {
        where: { userId },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      }
    }
  });

  if (!step) {
    throw new NotFoundError('Approval step not found');
  }

  if (step.assignments.length === 0) {
    throw new ValidationError('User is not assigned to this approval step');
  }

  if (step.status !== 'PENDING') {
    throw new ValidationError('Step has already been processed');
  }

  // Create approval record
  const approval = await prisma.approval.create({
    data: {
      stepId,
      userId,
      status: 'APPROVED',
      comments,
      conditions: JSON.stringify(conditions),
      approvedAt: new Date()
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true }
      }
    }
  });

  // Update step status
  await prisma.approvalStep.update({
    where: { id: stepId },
    data: { 
      status: 'APPROVED',
      approvedAt: new Date()
    }
  });

  // Check if workflow is complete
  const workflowComplete = await checkWorkflowCompletion(step.workflow.id);

  if (workflowComplete) {
    await completeWorkflow(step.workflow.id);
  }

  return {
    approval,
    workflowComplete,
    nextStep: workflowComplete ? null : await getNextPendingStep(step.workflow.id)
  };
}

async function rejectStep(stepId, userId, rejectionData) {
  const { comments = '', reason = '' } = rejectionData;

  // Verify step exists and user is assigned
  const step = await prisma.approvalStep.findFirst({
    where: { id: stepId },
    include: {
      workflow: {
        include: {
          purchaseOrder: {
            select: { id: true, reference: true, status: true }
          }
        }
      },
      assignments: {
        where: { userId },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      }
    }
  });

  if (!step) {
    throw new NotFoundError('Approval step not found');
  }

  if (step.assignments.length === 0) {
    throw new ValidationError('User is not assigned to this approval step');
  }

  if (step.status !== 'PENDING') {
    throw new ValidationError('Step has already been processed');
  }

  // Create rejection record
  const rejection = await prisma.approval.create({
    data: {
      stepId,
      userId,
      status: 'REJECTED',
      comments,
      conditions: JSON.stringify({ reason }),
      approvedAt: new Date()
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true }
      }
    }
  });

  // Update step status
  await prisma.approvalStep.update({
    where: { id: stepId },
    data: { 
      status: 'REJECTED',
      approvedAt: new Date()
    }
  });

  // Reject entire workflow
  await prisma.approvalWorkflow.update({
    where: { id: step.workflow.id },
    data: { 
      status: 'REJECTED',
      completedAt: new Date()
    }
  });

  // Update purchase order status
  await prisma.purchaseOrder.update({
    where: { id: step.workflow.purchaseOrder.id },
    data: { status: POStatus.CANCELLED }
  });

  return {
    rejection,
    workflowRejected: true
  };
}

async function checkWorkflowCompletion(workflowId) {
  const workflow = await prisma.approvalWorkflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        include: {
          approvals: true
        }
      }
    }
  });

  if (!workflow) {
    return false;
  }

  // Check if all required steps are approved
  const approvedSteps = workflow.steps.filter(step => step.status === 'APPROVED');
  return approvedSteps.length >= workflow.requiredApprovals;
}

async function completeWorkflow(workflowId) {
  const workflow = await prisma.approvalWorkflow.findUnique({
    where: { id: workflowId },
    include: {
      purchaseOrder: true
    }
  });

  if (!workflow) {
    throw new NotFoundError('Workflow not found');
  }

  // Update workflow status
  await prisma.approvalWorkflow.update({
    where: { id: workflowId },
    data: { 
      status: 'APPROVED',
      completedAt: new Date()
    }
  });

  // Update purchase order status to approved (ready for processing)
  await prisma.purchaseOrder.update({
    where: { id: workflow.purchaseOrder.id },
    data: { status: POStatus.PENDING } // Keep as pending until actually received
  });

  return {
    workflowId,
    purchaseOrderId: workflow.purchaseOrder.id,
    status: 'APPROVED',
    completedAt: new Date()
  };
}

async function getNextPendingStep(workflowId) {
  const nextStep = await prisma.approvalStep.findFirst({
    where: {
      workflowId,
      status: 'PENDING'
    },
    include: {
      assignments: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      }
    },
    orderBy: { stepOrder: 'asc' }
  });

  return nextStep;
}

async function getWorkflowStatus(purchaseOrderId, tenantId) {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { purchaseOrderId, tenantId },
    include: {
      steps: {
        include: {
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true }
              }
            }
          },
          approvals: {
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true }
              }
            }
          }
        },
        orderBy: { stepOrder: 'asc' }
      },
      purchaseOrder: {
        select: { id: true, reference: true, status: true, totalValue: true }
      }
    }
  });

  if (!workflow) {
    return null;
  }

  // Calculate progress
  const completedSteps = workflow.steps.filter(step => step.status !== 'PENDING');
  const progress = workflow.steps.length > 0 ? (completedSteps.length / workflow.steps.length) * 100 : 0;

  return {
    ...workflow,
    progress,
    completedSteps: completedSteps.length,
    totalSteps: workflow.steps.length,
    currentStep: workflow.steps.find(step => step.status === 'PENDING'),
    isComplete: workflow.status === 'APPROVED',
    isRejected: workflow.status === 'REJECTED'
  };
}

async function getUserPendingApprovals(userId, tenantId) {
  const pendingSteps = await prisma.approvalStep.findMany({
    where: {
      status: 'PENDING',
      workflow: {
        tenantId,
        status: 'PENDING'
      },
      assignments: {
        some: { userId }
      }
    },
    include: {
      workflow: {
        include: {
          purchaseOrder: {
            include: {
              supplier: {
                select: { id: true, name: true, contact: true }
              },
              items: {
                include: {
                  item: {
                    select: { id: true, name: true, sku: true, unit: true }
                  }
                }
              }
            }
          }
        }
      },
      assignments: {
        where: { userId },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  return pendingSteps.map(step => ({
    stepId: step.id,
    stepOrder: step.stepOrder,
    requiredRole: step.requiredRole,
    workflow: step.workflow,
    purchaseOrder: step.workflow.purchaseOrder,
    assignedAt: step.assignments[0]?.assignedAt,
    dueDate: step.dueDate
  }));
}

async function getApprovalHistory(purchaseOrderId, tenantId) {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { purchaseOrderId, tenantId },
    include: {
      steps: {
        include: {
          approvals: {
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true }
              }
            }
          },
          assignments: {
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true }
              }
            }
          }
        },
        orderBy: { stepOrder: 'asc' }
      }
    }
  });

  if (!workflow) {
    return null;
  }

  // Build timeline
  const timeline = workflow.steps.map(step => ({
    stepOrder: step.stepOrder,
    requiredRole: step.requiredRole,
    status: step.status,
    createdAt: step.createdAt,
    approvedAt: step.approvedAt,
    assignments: step.assignments.map(assignment => ({
      user: assignment.user,
      assignedAt: assignment.assignedAt
    })),
    approvals: step.approvals.map(approval => ({
      user: approval.user,
      status: approval.status,
      comments: approval.comments,
      approvedAt: approval.approvedAt,
      conditions: JSON.parse(approval.conditions || '{}')
    }))
  }));

  return {
    workflowId: workflow.id,
    status: workflow.status,
    createdAt: workflow.createdAt,
    completedAt: workflow.completedAt,
    timeline,
    summary: {
      totalSteps: workflow.steps.length,
      completedSteps: workflow.steps.filter(s => s.status !== 'PENDING').length,
      approvedSteps: workflow.steps.filter(s => s.status === 'APPROVED').length,
      rejectedSteps: workflow.steps.filter(s => s.status === 'REJECTED').length
    }
  };
}

module.exports = {
  createApprovalWorkflow,
  approveStep,
  rejectStep,
  getWorkflowStatus,
  getUserPendingApprovals,
  getApprovalHistory
};
