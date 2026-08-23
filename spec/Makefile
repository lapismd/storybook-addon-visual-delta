DENO ?= deno
MDBOOK ?= mdbook

.PHONY: build serve lint validate first check

build:
	$(MDBOOK) build .

serve:
	$(MDBOOK) serve . --open

lint:
	cd .. && $(DENO) task spec:lint

validate:
	cd .. && $(DENO) task spec:validate

first:
	cd .. && $(DENO) task spec:first

check:
	cd .. && $(DENO) task spec:check
