PNPM ?= pnpm
MDBOOK ?= mdbook

.PHONY: build serve lint validate first check

build:
	$(MDBOOK) build .

serve:
	$(MDBOOK) serve . --open

lint:
	cd ../../.. && $(PNPM) visual-delta:spec:lint

validate:
	cd ../../.. && $(PNPM) visual-delta:spec:validate

first:
	cd ../../.. && $(PNPM) visual-delta:spec:first

check:
	cd ../../.. && $(PNPM) visual-delta:spec:check
