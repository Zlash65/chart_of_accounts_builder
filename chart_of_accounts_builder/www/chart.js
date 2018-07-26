frappe.ready(function() {
	frappe.require("/assets/frappe/js/lib/awesomplete/awesomplete.min.js");
	frappe.require("/assets/frappe/js/lib/awesomplete/awesomplete.css");
	frappe.require("/assets/js/dialog.min.js");
	frappe.require("/assets/frappe/js/lib/jquery/jquery.hotkeys.js");

	frappe.require("/assets/js/control.min.js");

	frappe.provide("erpnext.ChartBuilder");
	erpnext.ChartBuilder = Class.extend({
		init: function() {
			var me = this;

			frappe.call({
				method: "chart_of_accounts_builder.utils.init_details",
				args: {
					company: frappe.utils.get_url_arg("company")
				},
				callback: function(r) {
					me.accounts_meta = r.message.accounts_meta;
					me.company_details = r.message.company || {};
					me.domains = r.message.domains;
				}
			});

			this.toolbar = [
				{
					label: __("Edit"),
					click: function(node) {
						me.edit_account();
					},
				},
				{
					label: __("Add Child"),
					click: function() {
						me.add_child();
					},
				},
				{
					label: __("Rename"),
					click: function(node) {
						me.rename_account();
					},
				},
				{
					label: __("Delete"),
					click: function(node) {
						me.delete_account();
					},
				}
			]
		},

		bind_events: function() {
			if( !cint(frappe.utils.get_url_arg("forked")) || cint(frappe.utils.get_url_arg("submitted")) ) {
				this.fork_charts();
			}

			if ( cint(frappe.utils.get_url_arg("forked")) && !cint(frappe.utils.get_url_arg("submitted")) ) {
				this.bind_node_toolbar();
				this.add_root();
				this.submit_charts();
				this.delete_charts();
			}

			if ( cint(frappe.utils.get_url_arg("forked")) && cint(frappe.utils.get_url_arg("submitted")) ) {
				this.download_chart();
			}

			if ( cint(frappe.utils.get_url_arg("submitted")) && frappe.session.user == frappe.utils.get_url_arg("owner")) {
				this.edit_chart();
			}

			this.add_star();
			this.email_comment();
		},

		bind_node_toolbar: function() {
			var me = this;

			$(".tree-link").each(function($link) {
				var data_account_name = $(this).attr('data-account-name');
				var $toolbar_wrapper = $('.tree-node-toolbar-wrapper[data-account-name="'+data_account_name+'"]');
				if($toolbar_wrapper.find('.tree-node-toolbar').length > 0) return;

				var $toolbar = $('<span class="tree-node-toolbar btn-group" ' +
					'data-account-name="'+ data_account_name +'"></span>').appendTo($toolbar_wrapper).hide();
				$.each(me.toolbar, function(i, item) {
					var link = $("<button class='btn btn-default btn-xs hidden-xs'></button>")
						.html(item.label)
						.appendTo($toolbar)
						.click(function() {
							item.click(me, this);
							return false;
						}
					);
				})

			}).on("click", function() {
				var data_account_name = $(this).attr('data-account-name');
				var $toolbar = $('.tree-node-toolbar[data-account-name="'+data_account_name+'"]');
				me.selected_node = this;
				me.current_toolbar = $toolbar;

				$('.bold').removeClass('bold');
				$(this).addClass("bold");

				$('.tree-node-toolbar').hide();
				me.current_toolbar.show();
			});
		},

		edit_account: function() {
			var node = $(this.selected_node);

			var d = new frappe.ui.Dialog({
				title: __('Edit Properties'),
				fields: [
					{
						fieldtype: "Data", fieldname: "account_name", label: "Account Name",
						"default": node.attr("data-account-name")
					},
					{
						fieldtype:'Check', fieldname:'is_group', label:__('Is Group'),
						default: cint(node.attr("data-is-group")),
						description: __('Further accounts can be made under Groups, but entries can be made against non-Groups')},
					{
						fieldtype:'Select', fieldname:'account_type', label:__('Account Type'),
						options: this.accounts_meta.fields.filter(d => d.fieldname=='account_type')[0].options,
						default: node.attr("data-account-type"),
						description: __("Optional. This setting will be used to filter in various transactions.")},
					{
						fieldtype:'Select', fieldname:'root_type', label:__('Root Type'),
						options: this.accounts_meta.fields.filter(d => d.fieldname=='root_type')[0].options,
						default: node.attr("data-root-type")
					},
					{
						fieldtype:'Data', fieldname:'tax_rate', label:__('Tax Rate'),
						default: node.attr("data-tax-rate")
					}
				]
			})

			//show root_type if root and tax_rate if account_type is tax
			var fd = d.fields_dict;

			var is_root = node.attr("data-parent-account")=="None" ? true : false;
			$(fd.root_type.wrapper).toggle(is_root);
			$(fd.is_group.wrapper).toggle(!is_root);
			$(fd.account_type.wrapper).toggle(!is_root);

			$(fd.tax_rate.wrapper).toggle(fd.account_type.get_value()==='Tax');

			$(fd.account_type.input).change(function() {
				$(fd.tax_rate.wrapper).toggle(fd.account_type.get_value()==='Tax');
			})

			// make account name field non-editable
			var field = d.get_field("account_name");
			field.df.read_only = 1;
			field.refresh();

			d.set_primary_action(__("Submit"), function() {
				var btn = this;
				var v = d.get_values();
				if(!v) return;
				v.name = node.attr("data-name")
				v.is_root = is_root
				v.company = frappe.utils.get_url_arg("company");

				return frappe.call({
					args: v,
					method: 'chart_of_accounts_builder.utils.update_account',
					freeze: true,
					callback: function(r) {
						d.hide();
						window.location.reload();
					}
				});
			});

			d.show();
		},

		add_child: function() {
			var node = $(this.selected_node);

			if(!(node && cint(node.attr("data-is-group")))) {
				frappe.msgprint(__("Select a group node first."));
				return;
			}

			this.make_new_account(node.attr('data-name'), node.attr('data-company'))
		},

		rename_account: function() {
			var selected_account_id = $(this.selected_node).attr("data-name");
			var selected_account_name = $(this.selected_node).attr("data-account-name");

			var d = new frappe.ui.Dialog({
				title:__('Rename Account'),
				fields: [
					{fieldtype:'Data', fieldname:'new_account_name',
					label:__('New Account Name'), reqd:true, default: selected_account_name}
				]
			});

			d.set_primary_action(__("Rename"), function() {
				var btn = this;
				var v = d.get_values();
				if(!v) return;

				return frappe.call({
					method:"chart_of_accounts_builder.utils.rename_account",
					args: {
						company: frappe.utils.get_url_arg("company"),
						doctype: "Account",
						old: selected_account_id,
						"new": v.new_account_name,
						"ignore_permissions": true
					},
					freeze: true,
					btn: d.get_primary_btn(),
					callback: function(r,rt) {
						if(!r.exc) {
							d.hide();
							window.location.reload();
						}
					}
				});
			});

			d.show()
		},

		delete_account: function() {
			var node = $(this.selected_node);

			return frappe.call({
				method: 'chart_of_accounts_builder.utils.delete_account',
				args: {
					account: node.attr("data-name"),
					company: frappe.utils.get_url_arg("company")
				},
				freeze: true,
				callback: function(r, rt) {
					if(!r.exc) {
						window.location.reload();
					}
				}
			})
		},

		make_new_account: function(parent_account, company) {
			var d = new frappe.ui.Dialog({
				title:__('New Account'),
				fields: [
					{
						fieldtype:'Data', fieldname:'account_name', label:__('New Account Name'), reqd:true,
						description: __("Name of new Account. Note: Please don't create accounts for Customers and Suppliers")},
					{
						fieldtype:'Data', fieldname:'account_number', label:__('Account Number'), reqd:false},
					{
						fieldtype:'Check', fieldname:'is_group', label:__('Is Group'),
						description: __('Further accounts can be made under Groups, but entries can be made against non-Groups')},
					{
						fieldtype:'Select', fieldname:'account_type', label:__('Account Type'),
						options: this.accounts_meta.fields.filter(d => d.fieldname=='account_type')[0].options,
						description: __("Optional. This setting will be used to filter in various transactions.")},
					{ fieldtype:'Data', fieldname:'tax_rate', label:__('Tax Rate') },
					{
						fieldtype:'Select', fieldname:'root_type', label:__('Root Type'),
						options: this.accounts_meta.fields.filter(d => d.fieldname=='root_type')[0].options
					},
				]
			})

			var fd = d.fields_dict;

			//show tax rate if account type is tax
			$(fd.tax_rate.wrapper).toggle(false);
			$(fd.account_type.input).change(function() {
				$(fd.tax_rate.wrapper).toggle(fd.account_type.get_value()==='Tax');
			})

			// In case of root, show root type and hide account_type, is_group
			var is_root = parent_account==null ? true : false;
			$(fd.is_group.wrapper).toggle(!is_root);
			$(fd.account_type.wrapper).toggle(!is_root);
			$(fd.root_type.wrapper).toggle(is_root);

			// bind primary action
			d.set_primary_action(__("Create"), function() {
				var btn = this;
				var v = d.get_values();
				if(!v) return;

				v.parent_account = parent_account;
				v.company = company;
				v.is_root = is_root ? 1 : 0;
				v.is_group = is_root ? 1 : v.is_group;
				v.ignore_permissions = 0;

				return frappe.call({
					args: v,
					method: 'chart_of_accounts_builder.utils.add_account',
					freeze: true,
					callback: function(r) {
						d.hide();
						window.location.reload();
					}
				});
			});

			d.show()
		},

		add_root: function() {
			var me = this;
			var company = frappe.utils.get_url_arg("company");
			$(".add-root-button").on("click", function() {
				me.make_new_account(null, company);
			})
		},

		fork_charts: function() {
			var company = frappe.utils.get_url_arg("company");
			$(".fork-button").addClass("btn-primary").on("click", function() {
				return frappe.call({
					method: 'chart_of_accounts_builder.utils.fork',
					args: {
						company: company
					},
					freeze: true,
					callback: function(r, rt) {
						if(!r.exc && r.message) {
							window.location.href = "/chart?company=" + r.message + "&forked=1&submitted=0"
						}
					}
				})
			})
		},

		submit_charts: function() {
			var company = frappe.utils.get_url_arg("company");
			var me = this;

			$(".submit-chart").on("click", function() {
				var d = new frappe.ui.Dialog({
					title:__('Assign Name'),
					fields: [
						{
							fieldtype:'Data', fieldname:'chart_of_accounts_name', label:__('Chart of Accounts Name'),
							reqd:true, description: __("Assign a unique name to this Chart."),
							default: me.company_details.chart_of_accounts_name || ""
						},
						{
							fieldtype:'Select', fieldname:'domain', label:__('Domain'),
							options: me.domains, default: me.company_details.domain || ""
						}
					]
				});

				d.set_primary_action(__("Submit"), function() {
					return frappe.call({
						method: 'chart_of_accounts_builder.utils.submit_chart',
						args: {
							company: company,
							chart_of_accounts_name: d.get_value("chart_of_accounts_name"),
							domain: d.get_value("domain")
						},
						freeze: true,
						callback: function(r, rt) {
							if(!r.exc) {
								window.location.href = "/all_charts"
							}
						}
					})
				});

				d.show();
			})
		},

		delete_charts: function() {
			var company = frappe.utils.get_url_arg("company");

			$(".delete-chart").on("click", function() {
				frappe.confirm(
					__('Are you sure you want to delete this Chart of Accounts'),
					function() { // called on-'yes' selection
						return frappe.call({
							method: "chart_of_accounts_builder.utils.delete_chart",
							args: {
								company: company
							},
							freeze: true,
							callback: function(r, rt) {
								if(!r.exc) {
									window.location.href = "/all_charts";
								}
							},
							onerror: function() {
								frappe.msgprint(__("Wrong Password"));
							}
						});
					},
					function() { } // called on-'no' selection
				)
			});

		},

		add_star: function() {
			var company = frappe.utils.get_url_arg("company");
			$(".star-button").on("click", function() {
				return frappe.call({
					method: 'chart_of_accounts_builder.utils.add_star',
					args: {
						company: company
					},
					freeze: true,
					callback: function(r, rt) {
						if(!r.exc && r.message) {
							$(".star-count").html(r.message);
						}
					}
				})
			})
		},

		email_comment: function() {
			$('#submit-comment').on('click', function() {
				return frappe.call({
					method: "chart_of_accounts_builder.utils.email_comment",
					args: {
						company: frappe.utils.get_url_arg("company"),
						comment: $("[name='comment']").val()
					},
					callback: function() { }
				})
			});
		},

		download_chart: function() {
			var company = frappe.utils.get_url_arg("company");
			$(".download-chart").on("click", function() {
				return frappe.call({
					method: "chart_of_accounts_builder.utils.export_submitted_coa",
					args: {
						chart: company
					},
					callback: function() {
						var file_url = "/files/submitted_charts/" + company + ".tar.gz"
						window.open(file_url);
					}
				})
			});
		},

		edit_chart: function() {
			var company = frappe.utils.get_url_arg("company");
			$(".edit-chart").on("click", function() {
				return frappe.call({
					method: "chart_of_accounts_builder.utils.edit_chart",
					args: {
						chart: company
					},
					callback: function() {
						window.location.href = updateQueryStringParameter(window.location.href, "submitted", 0);
					}
				})
			});
		}
	}),

	erpnext.coa = new erpnext.ChartBuilder();
	erpnext.coa.bind_events();
});

var updateQueryStringParameter = function(uri, key, value) {
	var re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
	var separator = uri.indexOf('?') !== -1 ? "&" : "?";
	if (uri.match(re)) {
		return uri.replace(re, '$1' + key + "=" + value + '$2');
	}
	else {
		return uri + separator + key + "=" + value;
	}
}
