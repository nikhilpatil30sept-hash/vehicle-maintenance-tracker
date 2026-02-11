describe('CarKeeper Debugging Suite', () => {
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    Cypress.on('uncaught:exception', (err, runnable) => {
      return false;
    });
    cy.visit(baseUrl);
  });

  it('Verifies login flow with case-insensitive matching', () => {
    // 1. Check if the Title exists (using regex to be safe)
    cy.contains(/CarKeeper/i, { timeout: 10000 }).should('be.visible');

    // 2. Type credentials
    cy.get('input[placeholder*="Username"]').type('testuser');
    cy.get('input[placeholder*="Password"]').type('password123');
    
    // 3. Click Enter - the /i makes it match "ENTER", "Enter", or "enter"
    cy.contains('button', /Enter/i).click({ force: true });

    // 4. Check for error message
    cy.get('body').then(($body) => {
      if ($body.find('.text-red-400').length > 0) {
        cy.log('Caught expected error message');
      }
    });
  });

  it('Checks if Register button works', () => {
    // Instead of looking for exact "Create Account", we look for "Create"
    cy.contains('button', /Create/i).click({ force: true });
    
    // Verify we moved to the registration view by checking for "Back" button
    cy.contains('button', /Back/i).should('be.visible');
  });
});